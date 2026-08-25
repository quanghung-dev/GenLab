import { describe, expect, it } from 'vitest';
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
      ['input.text', { execute: () => Promise.resolve({ text: 'hello' }) }],
      [
        'ai.text.generate',
        {
          execute: ({ inputs }) => {
            const prompt = inputs.prompt;
            if (typeof prompt !== 'string') return Promise.reject(new Error('Expected text prompt.'));
            return Promise.resolve({ text: `${prompt} world` });
          },
        },
      ],
      [
        'output.text',
        {
          execute: ({ inputs }) => {
            const text = inputs.text;
            if (typeof text !== 'string') return Promise.reject(new Error('Expected text output.'));
            return Promise.resolve({ text });
          },
        },
      ],
    ]);
    const executor = new WorkflowExecutor(createDefaultNodeRegistry(), handlers);
    const result = await executor.execute({
      executionId: crypto.randomUUID(),
      graph,
      signal: new AbortController().signal,
      observer: {
        onEvent: () => Promise.resolve(),
        onNodeState: () => Promise.resolve(),
      },
    });

    expect(result.terminalOutputs.output).toEqual({ text: 'hello world' });
  });
});
