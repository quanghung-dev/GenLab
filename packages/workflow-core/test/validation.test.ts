import { describe, expect, it } from 'vitest';
import type { WorkflowGraph } from '@genflow/workflow-types';
import { createDefaultNodeRegistry, validateWorkflow, workflowTemplates } from '../src/index.js';

const registry = createDefaultNodeRegistry();

describe('validateWorkflow', () => {
  it('returns deterministic parallel execution batches for a valid template', () => {
    const template = workflowTemplates.find((candidate) => candidate.id === 'prompt-script-image-video');
    expect(template).toBeDefined();
    const result = validateWorkflow(template?.graph, registry);

    expect(result.valid).toBe(true);
    expect(result.executionOrder).toEqual([
      ['prompt'],
      ['script'],
      ['image'],
      ['video'],
      ['output'],
    ]);
  });

  it('rejects cycles independently of React Flow', () => {
    const graph: WorkflowGraph = {
      schemaVersion: 1,
      name: 'Cycle',
      nodes: [
        { id: 'a', type: 'ai.text.generate', position: { x: 0, y: 0 }, config: {}, disabled: false },
        { id: 'b', type: 'ai.text.generate', position: { x: 200, y: 0 }, config: {}, disabled: false },
        { id: 'out', type: 'output.text', position: { x: 400, y: 0 }, config: {}, disabled: false },
      ],
      edges: [
        { id: 'a-b', source: 'a', sourcePort: 'text', target: 'b', targetPort: 'prompt' },
        { id: 'b-a', source: 'b', sourcePort: 'text', target: 'a', targetPort: 'prompt' },
        { id: 'b-out', source: 'b', sourcePort: 'text', target: 'out', targetPort: 'text' },
      ],
    };
    const result = validateWorkflow(graph, registry);

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'CYCLE_DETECTED' }));
  });

  it('rejects incompatible ports and excessive input cardinality', () => {
    const graph = structuredClone(workflowTemplates[0]?.graph) as WorkflowGraph;
    graph.edges.push({
      id: 'image-to-prompt',
      source: 'image',
      sourcePort: 'asset',
      target: 'image',
      targetPort: 'prompt',
    });
    const result = validateWorkflow(graph, registry);

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'INCOMPATIBLE_PORT_TYPES' }),
        expect.objectContaining({ code: 'INPUT_CARDINALITY_EXCEEDED' }),
      ]),
    );
  });
});
