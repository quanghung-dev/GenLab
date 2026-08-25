import type { ExecutionEvent, WorkflowGraph } from '@genflow/workflow-types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
const TOKEN_KEY = 'genflow.session';

export class ApiError extends Error {
  readonly code: string;
  readonly details?: unknown;
  readonly status: number;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export interface ApiEnvelope<T> {
  readonly data: T;
  readonly meta: { readonly requestId: string; readonly [key: string]: unknown };
}

export interface Session {
  readonly token: string;
  readonly user: { readonly id: string; readonly email: string; readonly displayName: string };
  readonly identity: { readonly userId: string; readonly workspaceId: string; readonly role: string };
}

export function getSession(): Session | null {
  if (typeof window === 'undefined') return null;
  const value = window.sessionStorage.getItem(TOKEN_KEY);
  if (!value) return null;
  try {
    return JSON.parse(value) as Session;
  } catch {
    window.sessionStorage.removeItem(TOKEN_KEY);
    return null;
  }
}

export function setSession(session: Session): void {
  window.sessionStorage.setItem(TOKEN_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  window.sessionStorage.removeItem(TOKEN_KEY);
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<T>
    | { error?: { code?: string; message?: string; details?: unknown } }
    | null;
  if (!response.ok) {
    const error = payload && 'error' in payload ? payload.error : undefined;
    throw new ApiError(
      error?.code ?? 'REQUEST_FAILED',
      error?.message ?? `Request failed with status ${response.status}.`,
      response.status,
      error?.details,
    );
  }
  if (!payload || !('data' in payload)) throw new ApiError('INVALID_RESPONSE', 'The API returned an invalid response.', 502);
  return payload.data;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { authenticated?: boolean } = {},
): Promise<T> {
  const { authenticated = true, headers, ...requestOptions } = options;
  const session = getSession();
  if (authenticated && !session) throw new ApiError('AUTH_REQUIRED', 'Please sign in.', 401);
  const response = await fetch(`${API_URL}${path}`, {
    ...requestOptions,
    headers: {
      accept: 'application/json',
      ...(requestOptions.body ? { 'content-type': 'application/json' } : {}),
      ...(authenticated && session ? { authorization: `Bearer ${session.token}` } : {}),
      ...headers,
    },
  });
  if (response.status === 401 && authenticated) clearSession();
  return parseResponse<T>(response);
}

export async function fetchAssetContent(assetId: string): Promise<Blob> {
  const session = getSession();
  if (!session) throw new ApiError('AUTH_REQUIRED', 'Please sign in.', 401);
  const response = await fetch(`${API_URL}/assets/${assetId}/content`, {
    headers: { authorization: `Bearer ${session.token}` },
  });
  if (!response.ok) throw new ApiError('ASSET_LOAD_FAILED', 'Asset could not be loaded.', response.status);
  return response.blob();
}

export async function subscribeToExecution(
  executionId: string,
  onEvent: (event: ExecutionEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const session = getSession();
  if (!session) throw new ApiError('AUTH_REQUIRED', 'Please sign in.', 401);
  const response = await fetch(`${API_URL}/executions/${executionId}/events`, {
    headers: { authorization: `Bearer ${session.token}`, accept: 'text/event-stream' },
    signal,
  });
  if (!response.ok || !response.body) throw new ApiError('EVENT_STREAM_FAILED', 'Execution stream is unavailable.', response.status);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (!signal.aborted) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      const data = frame
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice(6))
        .join('\n');
      if (!data) continue;
      try {
        const parsed = JSON.parse(data) as Partial<ExecutionEvent>;
        if (parsed.eventId && parsed.type) onEvent(parsed as ExecutionEvent);
      } catch {
        // Ignore malformed transient frames.
      }
    }
  }
}

export interface ProjectDto {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface WorkflowDto {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly description: string | null;
  readonly currentVersion: number;
  readonly workflowVersionId: string;
  readonly graph: WorkflowGraph;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AssetDto {
  readonly assetId: string;
  readonly assetType: 'image' | 'video' | 'audio' | 'document' | 'json' | 'text';
  readonly mimeType: string;
  readonly originalName: string | null;
  readonly sizeBytes: number;
  readonly createdAt: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}
