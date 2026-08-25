import { z } from 'zod';
import type { NodeDefinition, WorkflowTemplate } from '@genflow/workflow-types';
import { NodeRegistry } from './node-registry.js';

export const inputTextConfigSchema = z.object({
  value: z.string().max(50_000).default(''),
});

export const textGenerationConfigSchema = z.object({
  providerId: z.string().min(1).default('mock'),
  model: z.string().min(1).default('mock-text-v1'),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().min(1).max(100_000).default(2_000),
  timeoutMs: z.number().int().min(1_000).max(30 * 60_000).default(120_000),
  retry: z.number().int().min(0).max(5).default(2),
  parameters: z.record(z.string(), z.unknown()).default({}),
  credentialId: z.string().uuid().optional(),
});

export const imageGenerationConfigSchema = z.object({
  providerId: z.string().min(1).default('mock'),
  model: z.string().min(1).default('mock-image-v1'),
  width: z.number().int().min(64).max(8_192).default(1024),
  height: z.number().int().min(64).max(8_192).default(1024),
  seed: z.number().int().optional(),
  timeoutMs: z.number().int().min(1_000).max(60 * 60_000).default(10 * 60_000),
  retry: z.number().int().min(0).max(5).default(2),
  parameters: z.record(z.string(), z.unknown()).default({}),
  credentialId: z.string().uuid().optional(),
});

export const videoGenerationConfigSchema = z.object({
  providerId: z.string().min(1).default('mock'),
  model: z.string().min(1).default('mock-video-v1'),
  width: z.number().int().min(64).max(8_192).default(1280),
  height: z.number().int().min(64).max(8_192).default(720),
  durationSeconds: z.number().min(0.1).max(300).default(5),
  seed: z.number().int().optional(),
  timeoutMs: z.number().int().min(1_000).max(2 * 60 * 60_000).default(20 * 60_000),
  retry: z.number().int().min(0).max(5).default(2),
  parameters: z.record(z.string(), z.unknown()).default({}),
  credentialId: z.string().uuid().optional(),
});

const emptyConfigSchema = z.object({});

const definitions: readonly NodeDefinition[] = [
  {
    type: 'input.text',
    label: 'Text input',
    description: 'Provides a static prompt or text value.',
    category: 'input',
    inputs: [],
    outputs: [{ id: 'text', label: 'Text', dataType: 'string', required: true, multiple: false }],
    configSchema: inputTextConfigSchema,
    ui: { icon: 'Type', accent: '#9b8cff', width: 240 },
  },
  {
    type: 'ai.text.generate',
    label: 'Text generator',
    description: 'Generates text through a provider capability.',
    category: 'ai',
    inputs: [{ id: 'prompt', label: 'Prompt', dataType: 'string', required: true, multiple: false }],
    outputs: [{ id: 'text', label: 'Text', dataType: 'string', required: true, multiple: false }],
    configSchema: textGenerationConfigSchema,
    ui: { icon: 'Sparkles', accent: '#7b6cff', width: 260 },
  },
  {
    type: 'ai.image.generate',
    label: 'Image generator',
    description: 'Generates and persists an image asset.',
    category: 'ai',
    inputs: [{ id: 'prompt', label: 'Prompt', dataType: 'string', required: true, multiple: false }],
    outputs: [{ id: 'asset', label: 'Image', dataType: 'image', required: true, multiple: false }],
    configSchema: imageGenerationConfigSchema,
    ui: { icon: 'Image', accent: '#ff5fa2', width: 260 },
  },
  {
    type: 'ai.video.generate',
    label: 'Video generator',
    description: 'Generates and persists a video asset.',
    category: 'ai',
    inputs: [
      { id: 'prompt', label: 'Prompt', dataType: 'string', required: true, multiple: false },
      { id: 'image', label: 'Source image', dataType: 'image', required: false, multiple: false },
    ],
    outputs: [{ id: 'asset', label: 'Video', dataType: 'video', required: true, multiple: false }],
    configSchema: videoGenerationConfigSchema,
    ui: { icon: 'Clapperboard', accent: '#ff9f43', width: 260 },
  },
  {
    type: 'output.text',
    label: 'Text output',
    description: 'Marks text as a workflow result.',
    category: 'utility',
    inputs: [{ id: 'text', label: 'Text', dataType: 'string', required: true, multiple: false }],
    outputs: [{ id: 'text', label: 'Text', dataType: 'string', required: true, multiple: false }],
    configSchema: emptyConfigSchema,
    ui: { icon: 'LogOut', accent: '#2dd4bf', width: 220 },
  },
  {
    type: 'output.asset',
    label: 'Asset output',
    description: 'Marks an image, video, or audio asset as a workflow result.',
    category: 'utility',
    inputs: [{ id: 'asset', label: 'Asset', dataType: 'asset', required: true, multiple: false }],
    outputs: [{ id: 'asset', label: 'Asset', dataType: 'asset', required: true, multiple: false }],
    configSchema: emptyConfigSchema,
    ui: { icon: 'LogOut', accent: '#2dd4bf', width: 220 },
  },
];

export function createDefaultNodeRegistry(): NodeRegistry {
  const registry = new NodeRegistry();
  for (const definition of definitions) registry.register(definition);
  return registry;
}

export const workflowTemplates: readonly WorkflowTemplate[] = [
  {
    id: 'text-to-image',
    name: 'Text to image',
    description: 'Generate one image from a prompt.',
    category: 'Image',
    graph: {
      schemaVersion: 1,
      name: 'Text to image',
      nodes: [
        { id: 'prompt', type: 'input.text', position: { x: 80, y: 180 }, config: { value: 'A quiet winter city at blue hour' }, disabled: false },
        { id: 'image', type: 'ai.image.generate', position: { x: 400, y: 180 }, config: { providerId: 'mock', model: 'mock-image-v1' }, disabled: false },
        { id: 'output', type: 'output.asset', position: { x: 720, y: 180 }, config: {}, disabled: false },
      ],
      edges: [
        { id: 'prompt-image', source: 'prompt', sourcePort: 'text', target: 'image', targetPort: 'prompt' },
        { id: 'image-output', source: 'image', sourcePort: 'asset', target: 'output', targetPort: 'asset' },
      ],
    },
  },
  {
    id: 'text-to-video',
    name: 'Text to video',
    description: 'Generate one short video from a prompt.',
    category: 'Video',
    graph: {
      schemaVersion: 1,
      name: 'Text to video',
      nodes: [
        { id: 'prompt', type: 'input.text', position: { x: 80, y: 180 }, config: { value: 'A cinematic neon train crossing a rainy city' }, disabled: false },
        { id: 'video', type: 'ai.video.generate', position: { x: 400, y: 180 }, config: { providerId: 'mock', model: 'mock-video-v1' }, disabled: false },
        { id: 'output', type: 'output.asset', position: { x: 720, y: 180 }, config: {}, disabled: false },
      ],
      edges: [
        { id: 'prompt-video', source: 'prompt', sourcePort: 'text', target: 'video', targetPort: 'prompt' },
        { id: 'video-output', source: 'video', sourcePort: 'asset', target: 'output', targetPort: 'asset' },
      ],
    },
  },
  {
    id: 'prompt-script-image-video',
    name: 'AI short video starter',
    description: 'Draft a visual prompt, create a keyframe, and animate it.',
    category: 'Video',
    graph: {
      schemaVersion: 1,
      name: 'AI short video starter',
      nodes: [
        { id: 'prompt', type: 'input.text', position: { x: 40, y: 220 }, config: { value: 'A 10-second product story about a futuristic winter jacket' }, disabled: false },
        { id: 'script', type: 'ai.text.generate', position: { x: 330, y: 120 }, config: { providerId: 'mock', model: 'mock-text-v1' }, disabled: false },
        { id: 'image', type: 'ai.image.generate', position: { x: 640, y: 120 }, config: { providerId: 'mock', model: 'mock-image-v1', width: 1280, height: 720 }, disabled: false },
        { id: 'video', type: 'ai.video.generate', position: { x: 950, y: 220 }, config: { providerId: 'mock', model: 'mock-video-v1' }, disabled: false },
        { id: 'output', type: 'output.asset', position: { x: 1260, y: 220 }, config: {}, disabled: false },
      ],
      edges: [
        { id: 'prompt-script', source: 'prompt', sourcePort: 'text', target: 'script', targetPort: 'prompt' },
        { id: 'script-image', source: 'script', sourcePort: 'text', target: 'image', targetPort: 'prompt' },
        { id: 'script-video', source: 'script', sourcePort: 'text', target: 'video', targetPort: 'prompt' },
        { id: 'image-video', source: 'image', sourcePort: 'asset', target: 'video', targetPort: 'image' },
        { id: 'video-output', source: 'video', sourcePort: 'asset', target: 'output', targetPort: 'asset' },
      ],
    },
  },
];
