import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { AppError } from '@genflow/shared';
import type { JsonValue, ProviderModelDescriptor } from '@genflow/workflow-types';
import type {
  GeneratedArtifact,
  ImageGenerationInput,
  ProviderExecutionContext,
  ProviderPlugin,
  VideoGenerationInput,
} from './contracts.js';
import { assertSafeHttpUrl } from './network-safety.js';

interface ComfyUiProviderOptions {
  readonly baseUrl: string;
  readonly allowPrivateNetwork: boolean;
  readonly pollIntervalMs?: number;
  readonly timeoutMs?: number;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function workflowParameter(parameters: Readonly<Record<string, JsonValue>> | undefined): UnknownRecord {
  const workflow = asRecord(parameters?.workflow);
  if (!workflow) {
    throw new AppError({
      code: 'INVALID_INPUT',
      message: "ComfyUI requires a JSON object in parameters.workflow.",
      statusCode: 422,
    });
  }
  return workflow;
}

function outputFile(history: UnknownRecord, promptId: string): { filename: string; subfolder: string; type: string } | undefined {
  const promptHistory = asRecord(history[promptId]);
  const outputs = asRecord(promptHistory?.outputs);
  if (!outputs) return undefined;

  for (const output of Object.values(outputs)) {
    const record = asRecord(output);
    if (!record) continue;
    for (const key of ['images', 'videos', 'gifs']) {
      const files = record[key];
      if (!Array.isArray(files)) continue;
      for (const file of files) {
        const candidate = asRecord(file);
        if (typeof candidate?.filename === 'string') {
          return {
            filename: candidate.filename,
            subfolder: typeof candidate.subfolder === 'string' ? candidate.subfolder : '',
            type: typeof candidate.type === 'string' ? candidate.type : 'output',
          };
        }
      }
    }
  }
  return undefined;
}

function providerError(response: Response): AppError {
  if (response.status === 401 || response.status === 403) {
    return new AppError({ code: 'PROVIDER_AUTH_ERROR', message: 'ComfyUI rejected authentication.', statusCode: 502 });
  }
  if (response.status === 429) {
    return new AppError({
      code: 'PROVIDER_RATE_LIMIT',
      message: 'ComfyUI rate limit reached.',
      statusCode: 503,
      retryable: true,
    });
  }
  return new AppError({
    code: 'PROVIDER_UNAVAILABLE',
    message: `ComfyUI request failed with status ${response.status}.`,
    statusCode: 502,
    retryable: response.status >= 500,
  });
}

class ComfyUiHandler {
  readonly #options: Required<ComfyUiProviderOptions>;

  constructor(options: ComfyUiProviderOptions) {
    this.#options = {
      pollIntervalMs: 1_000,
      timeoutMs: 10 * 60_000,
      ...options,
    };
  }

  async generateImage(
    input: ImageGenerationInput,
    context: ProviderExecutionContext,
  ): Promise<GeneratedArtifact> {
    return this.#generate(
      workflowParameter(input.parameters),
      'image',
      input.model,
      context,
    );
  }

  async generateVideo(
    input: VideoGenerationInput,
    context: ProviderExecutionContext,
  ): Promise<GeneratedArtifact> {
    return this.#generate(
      workflowParameter(input.parameters),
      'video',
      input.model,
      context,
    );
  }

  async #generate(
    workflow: UnknownRecord,
    assetType: 'image' | 'video',
    model: string,
    context: ProviderExecutionContext,
  ): Promise<GeneratedArtifact> {
    const baseUrl = await assertSafeHttpUrl(this.#options.baseUrl, this.#options.allowPrivateNetwork);
    const submitUrl = new URL('/prompt', baseUrl);
    const response = await fetch(submitUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: workflow, client_id: randomUUID() }),
      signal: context.signal,
    });
    if (!response.ok) throw providerError(response);
    const submitted = asRecord(await response.json());
    const promptId = submitted?.prompt_id;
    if (typeof promptId !== 'string') {
      throw new AppError({
        code: 'PROVIDER_UNAVAILABLE',
        message: 'ComfyUI returned an invalid prompt identifier.',
        statusCode: 502,
      });
    }

    const startedAt = Date.now();
    let file: ReturnType<typeof outputFile>;
    while (!file) {
      if (Date.now() - startedAt > this.#options.timeoutMs) {
        throw new AppError({
          code: 'PROVIDER_TIMEOUT',
          message: 'ComfyUI generation timed out.',
          statusCode: 504,
          retryable: true,
        });
      }
      await delay(this.#options.pollIntervalMs, undefined, { signal: context.signal });
      const elapsed = Date.now() - startedAt;
      const progress = Math.min(90, 10 + Math.round((elapsed / this.#options.timeoutMs) * 80));
      await context.reportProgress(progress, 'Waiting for ComfyUI');
      const historyResponse = await fetch(new URL(`/history/${encodeURIComponent(promptId)}`, baseUrl), {
        signal: context.signal,
      });
      if (!historyResponse.ok) throw providerError(historyResponse);
      const history = asRecord(await historyResponse.json());
      if (history) file = outputFile(history, promptId);
    }

    const viewUrl = new URL('/view', baseUrl);
    viewUrl.searchParams.set('filename', file.filename);
    viewUrl.searchParams.set('subfolder', file.subfolder);
    viewUrl.searchParams.set('type', file.type);
    const assetResponse = await fetch(viewUrl, { signal: context.signal });
    if (!assetResponse.ok) throw providerError(assetResponse);
    await context.reportProgress(100, 'ComfyUI asset downloaded');
    const mimeType = assetResponse.headers.get('content-type') ?? (assetType === 'image' ? 'image/png' : 'video/mp4');
    return {
      assetType,
      mimeType,
      fileName: file.filename,
      content: new Uint8Array(await assetResponse.arrayBuffer()),
      metadata: { provider: 'comfyui', model, promptId },
    };
  }
}

export function createComfyUiProvider(options: ComfyUiProviderOptions): ProviderPlugin {
  const handler = new ComfyUiHandler(options);
  const models: readonly ProviderModelDescriptor[] = [
    {
      id: 'workflow-defined',
      label: 'Workflow-defined model',
      capabilities: ['image.generate', 'video.generate'],
    },
  ];
  return {
    id: 'comfyui',
    name: 'ComfyUI',
    enabled: true,
    models,
    handlers: {
      'image.generate': handler,
      'video.generate': handler,
    },
  };
}
