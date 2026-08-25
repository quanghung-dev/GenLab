import { randomUUID } from 'node:crypto';

export type ErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INVALID_INPUT'
  | 'INVALID_CONNECTION'
  | 'WORKFLOW_VALIDATION_FAILED'
  | 'NODE_EXECUTION_FAILED'
  | 'PROVIDER_AUTH_ERROR'
  | 'PROVIDER_RATE_LIMIT'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_UNAVAILABLE'
  | 'ASSET_UPLOAD_FAILED'
  | 'EXECUTION_CANCELLED'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;
  readonly retryable: boolean;

  constructor(options: {
    code: ErrorCode;
    message: string;
    statusCode?: number;
    details?: unknown;
    retryable?: boolean;
    cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = 'AppError';
    this.code = options.code;
    this.statusCode = options.statusCode ?? 500;
    this.details = options.details;
    this.retryable = options.retryable ?? false;
  }
}

export interface ApiMeta {
  readonly requestId: string;
  readonly [key: string]: unknown;
}

export interface ApiSuccess<T> {
  readonly data: T;
  readonly meta: ApiMeta;
}

export interface ApiFailure {
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly details?: unknown;
    readonly requestId: string;
  };
}

export function success<T>(data: T, requestId: string, meta: Record<string, unknown> = {}): ApiSuccess<T> {
  return { data, meta: { requestId, ...meta } };
}

export function createId(): string {
  return randomUUID();
}

const secretKeyPattern = /(?:api[-_]?key|authorization|credential|password|secret|token)/i;

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSecrets);
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        secretKeyPattern.test(key) ? '[REDACTED]' : redactSecrets(nestedValue),
      ]),
    );
  }

  return value;
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  return new AppError({
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred.',
    cause: error,
  });
}

export function assertNever(value: never): never {
  throw new AppError({
    code: 'INTERNAL_ERROR',
    message: `Unhandled value: ${String(value)}`,
  });
}
