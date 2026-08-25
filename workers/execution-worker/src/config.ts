import { parseEnvironment, workerEnvironmentSchema } from '@genflow/validation';

export function loadWorkerConfig() {
  return parseEnvironment(workerEnvironmentSchema, process.env);
}

export type WorkerConfig = ReturnType<typeof loadWorkerConfig>;
