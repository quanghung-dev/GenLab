import { z } from 'zod';

export const dataTypeSchema = z.enum([
  'string',
  'number',
  'boolean',
  'json',
  'image',
  'video',
  'audio',
  'asset',
  'any',
]);
export type DataType = z.infer<typeof dataTypeSchema>;

const specializedAssetTypes = new Set<DataType>(['image', 'video', 'audio']);

export function areDataTypesCompatible(source: DataType, target: DataType): boolean {
  return (
    source === target ||
    source === 'any' ||
    target === 'any' ||
    (target === 'asset' && specializedAssetTypes.has(source))
  );
}

export const capabilitySchema = z.enum([
  'text.generate',
  'image.generate',
  'video.generate',
  'audio.generate',
  'speech.synthesize',
  'speech.transcribe',
]);
export type Capability = z.infer<typeof capabilitySchema>;

export const nodeCategorySchema = z.enum(['input', 'ai', 'content', 'processing', 'logic', 'utility']);
export type NodeCategory = z.infer<typeof nodeCategorySchema>;

export const portDefinitionSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
  dataType: dataTypeSchema,
  required: z.boolean().default(false),
  multiple: z.boolean().default(false),
  description: z.string().max(400).optional(),
});
export type PortDefinition = z.infer<typeof portDefinitionSchema>;

export const workflowNodeSchema = z.object({
  id: z.string().min(1).max(120),
  type: z.string().min(1).max(120),
  name: z.string().min(1).max(160).optional(),
  position: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
  }),
  config: z.record(z.string(), z.unknown()).default({}),
  disabled: z.boolean().default(false),
});
export type WorkflowNode = z.infer<typeof workflowNodeSchema>;

export const workflowEdgeSchema = z.object({
  id: z.string().min(1).max(160),
  source: z.string().min(1).max(120),
  sourcePort: z.string().min(1).max(80),
  target: z.string().min(1).max(120),
  targetPort: z.string().min(1).max(80),
});
export type WorkflowEdge = z.infer<typeof workflowEdgeSchema>;

export const workflowGraphSchema = z.object({
  schemaVersion: z.literal(1),
  name: z.string().min(1).max(160),
  description: z.string().max(2_000).optional(),
  nodes: z.array(workflowNodeSchema).max(500),
  edges: z.array(workflowEdgeSchema).max(2_000),
});
export type WorkflowGraph = z.infer<typeof workflowGraphSchema>;

export const assetReferenceSchema = z.object({
  type: z.literal('asset'),
  assetId: z.string().uuid(),
  assetType: z.enum(['image', 'video', 'audio', 'document', 'json', 'text']),
  mimeType: z.string().min(1).max(160),
});
export type AssetReference = z.infer<typeof assetReferenceSchema>;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type NodeValue = JsonValue | AssetReference;
export type NodeInputMap = Readonly<Record<string, NodeValue | readonly NodeValue[] | undefined>>;
export type NodeOutputMap = Readonly<Record<string, NodeValue>>;

export const executionStatusSchema = z.enum([
  'PENDING',
  'QUEUED',
  'RUNNING',
  'SUCCESS',
  'FAILED',
  'CANCELLED',
]);
export type ExecutionStatus = z.infer<typeof executionStatusSchema>;

export const nodeExecutionStatusSchema = z.enum([
  'PENDING',
  'QUEUED',
  'RUNNING',
  'SUCCESS',
  'FAILED',
  'CANCELLED',
  'SKIPPED',
  'RETRYING',
]);
export type NodeExecutionStatus = z.infer<typeof nodeExecutionStatusSchema>;

export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly initialDelayMs: number;
  readonly backoffMultiplier: number;
  readonly maxDelayMs: number;
}

export interface ExecutionEvent {
  readonly eventId: string;
  readonly occurredAt: string;
  readonly executionId: string;
  readonly nodeExecutionId?: string;
  readonly type:
    | 'execution.started'
    | 'node.queued'
    | 'node.started'
    | 'node.progress'
    | 'node.completed'
    | 'node.failed'
    | 'execution.completed'
    | 'execution.failed'
    | 'execution.cancelled';
  readonly payload: Readonly<Record<string, JsonValue>>;
}

export interface NodeUiMetadata {
  readonly icon: string;
  readonly accent: string;
  readonly width?: number;
}

export interface NodeDefinition<TConfig extends Record<string, unknown> = Record<string, unknown>> {
  readonly type: string;
  readonly label: string;
  readonly description: string;
  readonly category: NodeCategory;
  readonly inputs: readonly PortDefinition[];
  readonly outputs: readonly PortDefinition[];
  readonly configSchema: z.ZodType<TConfig>;
  readonly ui: NodeUiMetadata;
}

export interface WorkflowTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly graph: WorkflowGraph;
}

export interface ProviderModelDescriptor {
  readonly id: string;
  readonly label: string;
  readonly capabilities: readonly Capability[];
  readonly metadata?: Readonly<Record<string, JsonValue>>;
}

export interface ProviderDescriptor {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly capabilities: readonly Capability[];
  readonly models: readonly ProviderModelDescriptor[];
}

export interface WorkflowValidationIssue {
  readonly code:
    | 'SCHEMA_INVALID'
    | 'DUPLICATE_NODE_ID'
    | 'DUPLICATE_EDGE_ID'
    | 'UNKNOWN_NODE_TYPE'
    | 'UNKNOWN_SOURCE_NODE'
    | 'UNKNOWN_TARGET_NODE'
    | 'UNKNOWN_SOURCE_PORT'
    | 'UNKNOWN_TARGET_PORT'
    | 'INCOMPATIBLE_PORT_TYPES'
    | 'DUPLICATE_CONNECTION'
    | 'INPUT_CARDINALITY_EXCEEDED'
    | 'SELF_CONNECTION'
    | 'CYCLE_DETECTED'
    | 'REQUIRED_INPUT_MISSING'
    | 'OUTPUT_NODE_MISSING'
    | 'UNREACHABLE_NODE';
  readonly message: string;
  readonly nodeId?: string;
  readonly edgeId?: string;
  readonly path?: string;
}

export interface WorkflowValidationResult {
  readonly valid: boolean;
  readonly issues: readonly WorkflowValidationIssue[];
  readonly executionOrder: readonly (readonly string[])[];
}
