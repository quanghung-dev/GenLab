import { describe, expect, it, vi } from 'vitest';
import type { NodeHandler } from '../src/executor.js';
import { createDefaultNodeRegistry, WorkflowExecutor } from '../src/index.js';
import type { WorkflowGraph } from '@genflow/workflow-types';

describe('WorkflowExecutor', () => {
  it('passes upstream values and records terminal output', async () => {
    const graph: WorkflowGraph = {
      schemaVersion: 1,
      name: 'Text pipeline',
      nodes: [
        { id: 'input', type: 'input.text', position: { x: 0, y: 0 }, config: {}, disabled: false },
        { id: 'generate', type: 'ai.text.generate', position: { x: 200, y: 0 }, config: { retry: 0 }, disabled: false },
        { id: 'output', type: 'output.text', position: { x: 400, y: 0 }, config: {}, disabled: false },
      ],
      edges: [
        { id: 'a', source: 'input', sourcePort: 'text', target: 'generate', targetPort: 'prompt' },
        { id: 'b', source: 'generate', sourcePort: 'text', target: 'output', targetPort: 'text' },
      ],
    };
    const handlers = new Map<string, NodeHandler>([
      ['input.text', { execute: vi.fn(async () => ({ text: 'hello' })) }],
      [
        'ai.text.generate',
        {
          execute: vi.fn(async ({ inputs }) => ({ text: `${String(inputs.prompt)} world` })),
        },
      ],
      ['output.text', { execute: vi.fn(async ({ inputs }) => ({ text: inputs.text as string })) }],
    ]);
    const executor = new WorkflowExecutor(createDefaultNodeRegistry(), handlers);
    const result = await executor.execute({
      executionId: crypto.randomUUID(),
      graph,
      signal: new AbortController().signal,
      observer: { onEvent: vi.fn(async () => undefined), onNodeState: vi.fn(async () => undefined) },
    });

    expect(result.terminalOutputs.output).toEqual({ text: 'hello world' });
  });
});
