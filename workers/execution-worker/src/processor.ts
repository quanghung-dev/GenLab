import type { AssetStorage } from '@genflow/asset-storage';
import type { ExecutionRecord, GenFlowRepository } from '@genflow/database';
import type { ProviderRegistry } from '@genflow/provider-sdk';
import { toAppError } from '@genflow/shared';
import type { ExecutionEvent } from '@genflow/workflow-types';
import {
  createBuiltInHandlers,
  createDefaultNodeRegistry,
  WorkflowExecutor,
} from '@genflow/workflow-core';
import type { EventBroker } from './redis-events.js';
import { DatabaseCredentialResolver } from './credential-resolver.js';
import { PersistedAssetWriter } from './persisted-asset-writer.js';

export interface ProcessExecutionDependencies {
  readonly repository: GenFlowRepository;
  readonly providers: ProviderRegistry;
  readonly storage: AssetStorage;
  readonly events: EventBroker;
  readonly credentialEncryptionKey: string;
  readonly maxParallelNodes: number;
}

function observeCancellation(
  repository: GenFlowRepository,
  execution: ExecutionRecord,
  controller: AbortController,
): () => void {
  const timer = setInterval(() => {
    void repository
      .getExecutionForWorker(execution.id, execution.workspaceId)
      .then((current) => {
        if (current.cancelRequestedAt || current.status === 'CANCELLED') controller.abort();
      })
      .catch(() => undefined);
  }, 1_000);
  return () => clearInterval(timer);
}

export async function processExecution(
  executionId: string,
  dependencies: ProcessExecutionDependencies,
): Promise<void> {
  const execution = await dependencies.repository.getExecutionForWorker(executionId);
  if (execution.status === 'CANCELLED' || execution.cancelRequestedAt) return;
  await dependencies.repository.markExecutionRunning(execution.id);
  const controller = new AbortController();
  const stopObservingCancellation = observeCancellation(dependencies.repository, execution, controller);
  const registry = createDefaultNodeRegistry();
  const handlers = createBuiltInHandlers({
    providers: dependencies.providers,
    assets: new PersistedAssetWriter(dependencies.repository, dependencies.storage, execution),
    credentials: new DatabaseCredentialResolver(
      dependencies.repository,
      execution.workspaceId,
      dependencies.credentialEncryptionKey,
    ),
  });
  const executor = new WorkflowExecutor(registry, handlers);
  const nodeTypes = new Map(execution.graph.nodes.map((node) => [node.id, node.type]));

  try {
    const result = await executor.execute({
      executionId: execution.id,
      graph: execution.graph,
      signal: controller.signal,
      maxParallelNodes: dependencies.maxParallelNodes,
      observer: {
        onEvent: async (event: ExecutionEvent) => {
          await Promise.all([
            dependencies.repository.appendEvent(execution.workspaceId, event),
            dependencies.events.publish(event),
          ]);
        },
        onNodeState: async (update) => {
          const nodeType = nodeTypes.get(update.nodeId) ?? 'unknown';
          await dependencies.repository.upsertNodeExecution(execution, nodeType, update);
        },
      },
    });
    await dependencies.repository.markExecutionCompleted(execution.id, result.terminalOutputs);
  } catch (errorValue) {
    const error = toAppError(errorValue);
    await dependencies.repository.markExecutionFailed(execution.id, error.code, error.message);
    throw error;
  } finally {
    stopObservingCancellation();
  }
}
