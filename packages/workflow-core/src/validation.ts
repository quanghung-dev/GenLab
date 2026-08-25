import { areDataTypesCompatible, workflowGraphSchema } from '@genflow/workflow-types';
import type {
  DataType,
  WorkflowEdge,
  WorkflowGraph,
  WorkflowValidationIssue,
  WorkflowValidationResult,
} from '@genflow/workflow-types';
import type { NodeRegistry } from './node-registry.js';

export function arePortTypesCompatible(source: DataType, target: DataType): boolean {
  return areDataTypesCompatible(source, target);
}

function pushDuplicateIssues(
  values: readonly { readonly id: string }[],
  code: 'DUPLICATE_NODE_ID' | 'DUPLICATE_EDGE_ID',
  label: string,
  issues: WorkflowValidationIssue[],
): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value.id)) {
      issues.push({ code, message: `${label} ID '${value.id}' is duplicated.` });
    }
    seen.add(value.id);
  }
}

function topologicalBatches(graph: WorkflowGraph): readonly (readonly string[])[] {
  const enabledNodes = graph.nodes.filter((node) => !node.disabled);
  const enabledIds = new Set(enabledNodes.map((node) => node.id));
  const indegree = new Map(enabledNodes.map((node) => [node.id, 0]));
  const outgoing = new Map(enabledNodes.map((node) => [node.id, [] as string[]]));

  for (const edge of graph.edges) {
    if (!enabledIds.has(edge.source) || !enabledIds.has(edge.target)) continue;
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    outgoing.get(edge.source)?.push(edge.target);
  }

  let ready = enabledNodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  const batches: string[][] = [];
  let visited = 0;
  while (ready.length > 0) {
    const batch = [...ready].sort();
    batches.push(batch);
    ready = [];
    for (const nodeId of batch) {
      visited += 1;
      for (const targetId of outgoing.get(nodeId) ?? []) {
        const next = (indegree.get(targetId) ?? 1) - 1;
        indegree.set(targetId, next);
        if (next === 0) ready.push(targetId);
      }
    }
  }
  return visited === enabledNodes.length ? batches : [];
}

function nodesThatReachOutput(graph: WorkflowGraph): Set<string> {
  const reverse = new Map<string, string[]>();
  for (const node of graph.nodes) reverse.set(node.id, []);
  for (const edge of graph.edges) reverse.get(edge.target)?.push(edge.source);
  const stack = graph.nodes.filter((node) => node.type.startsWith('output.')).map((node) => node.id);
  const reached = new Set<string>();
  while (stack.length > 0) {
    const nodeId = stack.pop();
    if (!nodeId || reached.has(nodeId)) continue;
    reached.add(nodeId);
    stack.push(...(reverse.get(nodeId) ?? []));
  }
  return reached;
}

export function validateWorkflow(graphInput: unknown, registry: NodeRegistry): WorkflowValidationResult {
  const parsed = workflowGraphSchema.safeParse(graphInput);
  if (!parsed.success) {
    return {
      valid: false,
      issues: parsed.error.issues.map((issue) => ({
        code: 'SCHEMA_INVALID',
        message: issue.message,
        path: issue.path.join('.'),
      })),
      executionOrder: [],
    };
  }

  const graph = parsed.data;
  const issues: WorkflowValidationIssue[] = [];
  pushDuplicateIssues(graph.nodes, 'DUPLICATE_NODE_ID', 'Node', issues);
  pushDuplicateIssues(graph.edges, 'DUPLICATE_EDGE_ID', 'Edge', issues);
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const connectionKeys = new Set<string>();
  const targetConnections = new Map<string, number>();

  for (const node of graph.nodes) {
    if (!registry.get(node.type)) {
      issues.push({
        code: 'UNKNOWN_NODE_TYPE',
        message: `Node '${node.id}' uses unknown type '${node.type}'.`,
        nodeId: node.id,
      });
    }
  }

  for (const edge of graph.edges) {
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    if (!source) {
      issues.push({ code: 'UNKNOWN_SOURCE_NODE', message: `Source node '${edge.source}' does not exist.`, edgeId: edge.id });
      continue;
    }
    if (!target) {
      issues.push({ code: 'UNKNOWN_TARGET_NODE', message: `Target node '${edge.target}' does not exist.`, edgeId: edge.id });
      continue;
    }
    if (edge.source === edge.target) {
      issues.push({ code: 'SELF_CONNECTION', message: 'A node cannot connect to itself.', edgeId: edge.id, nodeId: edge.source });
    }

    const sourceDefinition = registry.get(source.type);
    const targetDefinition = registry.get(target.type);
    const sourcePort = sourceDefinition?.outputs.find((port) => port.id === edge.sourcePort);
    const targetPort = targetDefinition?.inputs.find((port) => port.id === edge.targetPort);
    if (sourceDefinition && !sourcePort) {
      issues.push({ code: 'UNKNOWN_SOURCE_PORT', message: `Output port '${edge.sourcePort}' does not exist on '${source.id}'.`, edgeId: edge.id, nodeId: source.id });
    }
    if (targetDefinition && !targetPort) {
      issues.push({ code: 'UNKNOWN_TARGET_PORT', message: `Input port '${edge.targetPort}' does not exist on '${target.id}'.`, edgeId: edge.id, nodeId: target.id });
    }
    if (sourcePort && targetPort && !arePortTypesCompatible(sourcePort.dataType, targetPort.dataType)) {
      issues.push({
        code: 'INCOMPATIBLE_PORT_TYPES',
        message: `Cannot connect ${sourcePort.dataType} to ${targetPort.dataType}.`,
        edgeId: edge.id,
      });
    }

    const connectionKey = `${edge.source}:${edge.sourcePort}->${edge.target}:${edge.targetPort}`;
    if (connectionKeys.has(connectionKey)) {
      issues.push({ code: 'DUPLICATE_CONNECTION', message: 'This connection already exists.', edgeId: edge.id });
    }
    connectionKeys.add(connectionKey);
    const targetKey = `${edge.target}:${edge.targetPort}`;
    const count = (targetConnections.get(targetKey) ?? 0) + 1;
    targetConnections.set(targetKey, count);
    if (count > 1 && targetPort && !targetPort.multiple) {
      issues.push({
        code: 'INPUT_CARDINALITY_EXCEEDED',
        message: `Input '${edge.targetPort}' accepts only one connection.`,
        edgeId: edge.id,
        nodeId: target.id,
      });
    }
  }

  for (const node of graph.nodes) {
    if (node.disabled) continue;
    const definition = registry.get(node.type);
    if (!definition) continue;
    for (const port of definition.inputs.filter((candidate) => candidate.required)) {
      if ((targetConnections.get(`${node.id}:${port.id}`) ?? 0) === 0) {
        issues.push({
          code: 'REQUIRED_INPUT_MISSING',
          message: `Required input '${port.label}' is not connected.`,
          nodeId: node.id,
        });
      }
    }
  }

  const outputs = graph.nodes.filter((node) => node.type.startsWith('output.') && !node.disabled);
  if (outputs.length === 0) {
    issues.push({ code: 'OUTPUT_NODE_MISSING', message: 'The workflow needs at least one output node.' });
  } else {
    const reached = nodesThatReachOutput(graph);
    for (const node of graph.nodes.filter((candidate) => !candidate.disabled)) {
      if (!reached.has(node.id)) {
        issues.push({
          code: 'UNREACHABLE_NODE',
          message: `Node '${node.id}' does not contribute to an output.`,
          nodeId: node.id,
        });
      }
    }
  }

  const batches = topologicalBatches(graph);
  if (graph.nodes.some((node) => !node.disabled) && batches.length === 0) {
    issues.push({ code: 'CYCLE_DETECTED', message: 'The workflow contains a directed cycle.' });
  }

  return { valid: issues.length === 0, issues, executionOrder: issues.length === 0 ? batches : [] };
}

export function incomingEdges(graph: WorkflowGraph, nodeId: string): readonly WorkflowEdge[] {
  return graph.edges.filter((edge) => edge.target === nodeId);
}
