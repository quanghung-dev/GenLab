import { setTimeout as delay } from 'node:timers/promises';
import { AppError, createId, toAppError } from '@genflow/shared';
import type {
  ExecutionEvent,
  NodeInputMap,
  NodeOutputMap,
  NodeValue,
  RetryPolicy,
  WorkflowGraph,
  WorkflowNode,
} from '@genflow/workflow-types';
import { incomingEdges, validateWorkflow } from './validation.js';
import type { NodeRegistry } from './node-registry.js';

export interface NodeExecutionContext {
  readonly executionId: string;
  readonly nodeExecutionId: string;
  readonly attempt: number;
  readonly node: WorkflowNode;
  readonly inputs: NodeInputMap;
  readonly signal: AbortSignal;
  readonly reportProgress: (progress: number, message?: string) => Promise<void>;
}

export interface NodeHandler {
  execute(context: NodeExecutionContext): Promise<NodeOutputMap>;
}

export interface ExecutionObserver {
  onEvent(event: ExecutionEvent): Promise<void>;
  onNodeState(update: {
    nodeExecutionId: string;
    nodeId: string;
    attempt: number;
    status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'RETRYING' | 'SKIPPED' | 'CANCELLED';
    outputs?: NodeOutputMap;
    error?: { code: string; message: string };
    startedAt?: string;
    finishedAt?: string;
  }): Promise<void>;
}

export interface ExecuteWorkflowOptions {
  readonly executionId: string;
  readonly graph: WorkflowGraph;
  readonly signal: AbortSignal;
  readonly observer: ExecutionObserver;
  readonly maxParallelNodes?: number;
  readonly defaultRetryPolicy?: RetryPolicy;
}

export interface WorkflowExecutionResult {
  readonly outputsByNode: ReadonlyMap<string, NodeOutputMap>;
  readonly terminalOutputs: Readonly<Record<string, NodeOutputMap>>;
}

const defaultRetryPolicy: RetryPolicy = {
  maxAttempts: 3,
  initialDelayMs: 500,
  backoffMultiplier: 2,
  maxDelayMs: 10_000,
};

function event(
  executionId: string,
  type: ExecutionEvent['type'],
  payload: ExecutionEvent['payload'],
  nodeExecutionId?: string,
): ExecutionEvent {
  return {
    eventId: createId(),
    occurredAt: new Date().toISOString(),
    executionId,
    ...(nodeExecutionId ? { nodeExecutionId } : {}),
    type,
    payload,
  };
}

function buildInputs(
  graph: WorkflowGraph,
  nodeId: string,
  outputsByNode: ReadonlyMap<string, NodeOutputMap>,
): NodeInputMap {
  const grouped = new Map<string, NodeValue[]>();
  for (const edge of incomingEdges(graph, nodeId)) {
    const value = outputsByNode.get(edge.source)?.[edge.sourcePort];
    if (value === undefined) continue;
    const values = grouped.get(edge.targetPort) ?? [];
    values.push(value);
    grouped.set(edge.targetPort, values);
  }
  return Object.fromEntries(
    [...grouped.entries()].map(([port, values]) => [port, values.length === 1 ? values[0] : values]),
  );
}

async function mapWithConcurrency<T>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (nextIndex < values.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const value = values[currentIndex];
      if (value !== undefined) await mapper(value);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
}

export class WorkflowExecutor {
  readonly #registry: NodeRegistry;
  readonly #handlers: ReadonlyMap<string, NodeHandler>;

  constructor(registry: NodeRegistry, handlers: ReadonlyMap<string, NodeHandler>) {
    this.#registry = registry;
    this.#handlers = handlers;
  }

  async execute(options: ExecuteWorkflowOptions): Promise<WorkflowExecutionResult> {
    const validation = validateWorkflow(options.graph, this.#registry);
    if (!validation.valid) {
      throw new AppError({
        code: 'WORKFLOW_VALIDATION_FAILED',
        message: 'Workflow validation failed before execution.',
        statusCode: 422,
        details: validation.issues,
      });
    }

    const nodes = new Map(options.graph.nodes.map((node) => [node.id, node]));
    const outputsByNode = new Map<string, NodeOutputMap>();
    const policy = options.defaultRetryPolicy ?? defaultRetryPolicy;
    await options.observer.onEvent(event(options.executionId, 'execution.started', {}));

    for (const batch of validation.executionOrder) {
      if (options.signal.aborted) {
        await options.observer.onEvent(event(options.executionId, 'execution.cancelled', {}));
        throw new AppError({ code: 'EXECUTION_CANCELLED', message: 'Execution was cancelled.', statusCode: 409 });
      }
      await mapWithConcurrency(batch, options.maxParallelNodes ?? 4, async (nodeId) => {
        const node = nodes.get(nodeId);
        if (!node) return;
        if (node.disabled) {
          const nodeExecutionId = createId();
          await options.observer.onNodeState({ nodeExecutionId, nodeId, attempt: 0, status: 'SKIPPED' });
          return;
        }
        const handler = this.#handlers.get(node.type);
        if (!handler) {
          throw new AppError({
            code: 'NODE_EXECUTION_FAILED',
            message: `No execution handler is registered for '${node.type}'.`,
            statusCode: 500,
          });
        }
        const nodePolicy: RetryPolicy = {
          ...policy,
          maxAttempts:
            typeof node.config.retry === 'number'
              ? Math.max(1, Math.floor(node.config.retry) + 1)
              : policy.maxAttempts,
        };
        const nodeExecutionId = createId();
        const inputs = buildInputs(options.graph, nodeId, outputsByNode);
        let lastError: AppError | undefined;
        for (let attempt = 1; attempt <= nodePolicy.maxAttempts; attempt += 1) {
          const startedAt = new Date().toISOString();
          await options.observer.onNodeState({
            nodeExecutionId,
            nodeId,
            attempt,
            status: 'RUNNING',
            startedAt,
          });
          await options.observer.onEvent(
            event(options.executionId, 'node.started', { nodeId, attempt }, nodeExecutionId),
          );
          try {
            const outputs = await handler.execute({
              executionId: options.executionId,
              nodeExecutionId,
              attempt,
              node,
              inputs,
              signal: options.signal,
              reportProgress: async (progress, message) => {
                await options.observer.onEvent(
                  event(
                    options.executionId,
                    'node.progress',
                    { nodeId, progress, ...(message ? { message } : {}) },
                    nodeExecutionId,
                  ),
                );
              },
            });
            outputsByNode.set(nodeId, outputs);
            await options.observer.onNodeState({
              nodeExecutionId,
              nodeId,
              attempt,
              status: 'SUCCESS',
              outputs,
              finishedAt: new Date().toISOString(),
            });
            await options.observer.onEvent(
              event(options.executionId, 'node.completed', { nodeId, attempt }, nodeExecutionId),
            );
            return;
          } catch (errorValue) {
            lastError = toAppError(errorValue);
            if (options.signal.aborted) {
              await options.observer.onNodeState({
                nodeExecutionId,
                nodeId,
                attempt,
                status: 'CANCELLED',
                finishedAt: new Date().toISOString(),
              });
              throw new AppError({ code: 'EXECUTION_CANCELLED', message: 'Execution was cancelled.', statusCode: 409 });
            }
            const willRetry = lastError.retryable && attempt < nodePolicy.maxAttempts;
            await options.observer.onNodeState({
              nodeExecutionId,
              nodeId,
              attempt,
              status: willRetry ? 'RETRYING' : 'FAILED',
              error: { code: lastError.code, message: lastError.message },
              finishedAt: new Date().toISOString(),
            });
            if (!willRetry) {
              await options.observer.onEvent(
                event(
                  options.executionId,
                  'node.failed',
                  { nodeId, attempt, code: lastError.code, message: lastError.message },
                  nodeExecutionId,
                ),
              );
              throw lastError;
            }
            const backoff = Math.min(
              nodePolicy.maxDelayMs,
              nodePolicy.initialDelayMs * nodePolicy.backoffMultiplier ** (attempt - 1),
            );
            await delay(backoff, undefined, { signal: options.signal });
          }
        }
        throw lastError ?? new AppError({ code: 'NODE_EXECUTION_FAILED', message: 'Node failed.', statusCode: 500 });
      });
    }

    const terminalOutputs = Object.fromEntries(
      options.graph.nodes
        .filter((node) => node.type.startsWith('output.'))
        .flatMap((node) => {
          const outputs = outputsByNode.get(node.id);
          return outputs ? [[node.id, outputs] as const] : [];
        }),
    );
    await options.observer.onEvent(event(options.executionId, 'execution.completed', {}));
    return { outputsByNode, terminalOutputs };
  }
}
