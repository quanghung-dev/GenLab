import { AppError } from '@genflow/shared';
import type { AssetReference, JsonValue, NodeOutputMap, NodeValue } from '@genflow/workflow-types';
import type { GeneratedArtifact, ProviderRegistry } from '@genflow/provider-sdk';
import {
  imageGenerationConfigSchema,
  inputTextConfigSchema,
  textGenerationConfigSchema,
  videoGenerationConfigSchema,
} from './definitions.js';
import type { NodeHandler } from './executor.js';

export interface AssetWriter {
  write(
    artifact: GeneratedArtifact,
    context: { executionId: string; nodeExecutionId: string },
  ): Promise<AssetReference>;
}

export interface CredentialResolver {
  resolve(credentialId: string | undefined): Promise<Readonly<Record<string, string>>>;
}

export interface BuiltInHandlerDependencies {
  readonly providers: ProviderRegistry;
  readonly assets: AssetWriter;
  readonly credentials: CredentialResolver;
}

function requiredString(value: NodeValue | readonly NodeValue[] | undefined, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AppError({
      code: 'INVALID_INPUT',
      message: `${label} must be a non-empty string.`,
      statusCode: 422,
    });
  }
  return value;
}

function optionalAssetId(value: NodeValue | readonly NodeValue[] | undefined): string | undefined {
  if (value && !Array.isArray(value) && typeof value === 'object' && 'assetId' in value) {
    return typeof value.assetId === 'string' ? value.assetId : undefined;
  }
  return undefined;
}

function jsonParameters(value: Record<string, unknown>): Readonly<Record<string, JsonValue>> {
  return value as Readonly<Record<string, JsonValue>>;
}

export function createBuiltInHandlers(dependencies: BuiltInHandlerDependencies): ReadonlyMap<string, NodeHandler> {
  const handlers = new Map<string, NodeHandler>();
  handlers.set('input.text', {
    execute: ({ node }): Promise<NodeOutputMap> => {
      const config = inputTextConfigSchema.parse(node.config);
      return Promise.resolve({ text: config.value });
    },
  });
  handlers.set('ai.text.generate', {
    execute: async (context): Promise<NodeOutputMap> => {
      const config = textGenerationConfigSchema.parse(context.node.config);
      const credentials = await dependencies.credentials.resolve(config.credentialId);
      const provider = dependencies.providers.resolve(config.providerId, 'text.generate');
      const result = await provider.generateText(
        {
          prompt: requiredString(context.inputs.prompt, 'Prompt'),
          model: config.model,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
          parameters: jsonParameters(config.parameters),
        },
        {
          executionId: context.executionId,
          nodeExecutionId: context.nodeExecutionId,
          idempotencyKey: `${context.executionId}:${context.node.id}:${context.attempt}`,
          signal: context.signal,
          credentials,
          reportProgress: context.reportProgress,
        },
      );
      return { text: result.text, metadata: result.metadata as JsonValue };
    },
  });
  handlers.set('ai.image.generate', {
    execute: async (context): Promise<NodeOutputMap> => {
      const config = imageGenerationConfigSchema.parse(context.node.config);
      const credentials = await dependencies.credentials.resolve(config.credentialId);
      const provider = dependencies.providers.resolve(config.providerId, 'image.generate');
      const artifact = await provider.generateImage(
        {
          prompt: requiredString(context.inputs.prompt, 'Prompt'),
          model: config.model,
          width: config.width,
          height: config.height,
          ...(config.seed === undefined ? {} : { seed: config.seed }),
          parameters: jsonParameters(config.parameters),
        },
        {
          executionId: context.executionId,
          nodeExecutionId: context.nodeExecutionId,
          idempotencyKey: `${context.executionId}:${context.node.id}:${context.attempt}`,
          signal: context.signal,
          credentials,
          reportProgress: context.reportProgress,
        },
      );
      const reference = await dependencies.assets.write(artifact, context);
      return { asset: reference };
    },
  });
  handlers.set('ai.video.generate', {
    execute: async (context): Promise<NodeOutputMap> => {
      const config = videoGenerationConfigSchema.parse(context.node.config);
      const credentials = await dependencies.credentials.resolve(config.credentialId);
      const provider = dependencies.providers.resolve(config.providerId, 'video.generate');
      const sourceImageAssetId = optionalAssetId(context.inputs.image);
      const artifact = await provider.generateVideo(
        {
          prompt: requiredString(context.inputs.prompt, 'Prompt'),
          model: config.model,
          durationSeconds: config.durationSeconds,
          width: config.width,
          height: config.height,
          ...(sourceImageAssetId === undefined ? {} : { sourceImageAssetId }),
          ...(config.seed === undefined ? {} : { seed: config.seed }),
          parameters: jsonParameters(config.parameters),
        },
        {
          executionId: context.executionId,
          nodeExecutionId: context.nodeExecutionId,
          idempotencyKey: `${context.executionId}:${context.node.id}:${context.attempt}`,
          signal: context.signal,
          credentials,
          reportProgress: context.reportProgress,
        },
      );
      const reference = await dependencies.assets.write(artifact, context);
      return { asset: reference };
    },
  });
  handlers.set('output.text', {
    execute: ({ inputs }): Promise<NodeOutputMap> =>
      Promise.resolve({ text: requiredString(inputs.text, 'Text') }),
  });
  handlers.set('output.asset', {
    execute: ({ inputs }): Promise<NodeOutputMap> => {
      const value = inputs.asset;
      if (!value || Array.isArray(value) || typeof value !== 'object' || !('assetId' in value)) {
        throw new AppError({ code: 'INVALID_INPUT', message: 'Asset output requires an asset.', statusCode: 422 });
      }
      return Promise.resolve({ asset: value });
    },
  });
  return handlers;
}

export class EmptyCredentialResolver implements CredentialResolver {
  resolve(): Promise<Readonly<Record<string, string>>> {
    return Promise.resolve({});
  }
}
