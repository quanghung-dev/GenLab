import { apiEnvironmentSchema, parseEnvironment } from '@genflow/validation';

export function loadApiConfig() {
  return parseEnvironment(apiEnvironmentSchema, process.env);
}

export type ApiConfig = ReturnType<typeof loadApiConfig>;
