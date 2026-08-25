import { z } from 'zod';
import { workflowGraphSchema } from '@genflow/workflow-types';

const environmentBoolean = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const commonEnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  CREDENTIAL_ENCRYPTION_KEY: z.string().min(32),
  ASSET_DRIVER: z.enum(['local', 's3']).default('local'),
  LOCAL_ASSET_PATH: z.string().min(1).default('./storage'),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_BUCKET: z.string().min(1).default('genflow'),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: environmentBoolean.default('true'),
  MOCK_MODE: environmentBoolean.default('true'),
  COMFYUI_BASE_URL: z.string().url().optional().or(z.literal('')),
  COMFYUI_ALLOW_PRIVATE_NETWORK: environmentBoolean,
});

export const apiEnvironmentSchema = commonEnvironmentSchema.extend({
  API_HOST: z.string().min(1).default('0.0.0.0'),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
});

export const workerEnvironmentSchema = commonEnvironmentSchema.extend({
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(4),
});

export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;
export type WorkerEnvironment = z.infer<typeof workerEnvironmentSchema>;

export const registerRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(10).max(128),
  displayName: z.string().trim().min(2).max(100),
  workspaceName: z.string().trim().min(2).max(120).optional(),
});

export const loginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
});

export const projectCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2_000).optional(),
});

export const projectUpdateSchema = projectCreateSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field is required.',
});

export const workflowCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2_000).optional(),
  graph: workflowGraphSchema.optional(),
  templateId: z.string().max(120).optional(),
});

export const workflowVersionCreateSchema = z.object({
  graph: workflowGraphSchema,
  expectedVersion: z.number().int().min(0),
  changeSummary: z.string().trim().max(500).optional(),
});

export const workflowValidationRequestSchema = z.object({
  graph: workflowGraphSchema,
});

export const executionCreateSchema = z.object({
  workflowVersionId: z.string().uuid().optional(),
  idempotencyKey: z.string().min(8).max(200).optional(),
  inputOverrides: z.record(z.string(), z.unknown()).default({}),
});

export function parseEnvironment<T>(schema: z.ZodType<T>, environment: NodeJS.ProcessEnv): T {
  return schema.parse(environment);
}
