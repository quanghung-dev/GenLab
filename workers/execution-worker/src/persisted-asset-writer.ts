import { createHash, randomUUID } from 'node:crypto';
import type { AssetStorage } from '@genflow/asset-storage';
import type { ExecutionRecord, GenFlowRepository } from '@genflow/database';
import type { GeneratedArtifact } from '@genflow/provider-sdk';
import type { AssetReference } from '@genflow/workflow-types';
import type { AssetWriter } from '@genflow/workflow-core';

function safeFileName(fileName: string): string {
  const cleaned = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-180);
  return cleaned || 'asset.bin';
}

export class PersistedAssetWriter implements AssetWriter {
  readonly #repository: GenFlowRepository;
  readonly #storage: AssetStorage;
  readonly #execution: ExecutionRecord;

  constructor(repository: GenFlowRepository, storage: AssetStorage, execution: ExecutionRecord) {
    this.#repository = repository;
    this.#storage = storage;
    this.#execution = execution;
  }

  async write(
    artifact: GeneratedArtifact,
    context: { executionId: string; nodeExecutionId: string },
  ): Promise<AssetReference> {
    const fileName = `${randomUUID()}-${safeFileName(artifact.fileName)}`;
    const storageKey = [
      this.#execution.workspaceId,
      this.#execution.projectId,
      context.executionId,
      context.nodeExecutionId,
      fileName,
    ].join('/');
    const checksumSha256 = createHash('sha256').update(artifact.content).digest('hex');
    const stored = await this.#storage.put(storageKey, artifact.content, artifact.mimeType);
    const saved = await this.#repository.createAsset({
      workspaceId: this.#execution.workspaceId,
      projectId: this.#execution.projectId,
      executionId: context.executionId,
      nodeExecutionId: context.nodeExecutionId,
      assetType: artifact.assetType,
      mimeType: artifact.mimeType,
      storageKey: stored.storageKey,
      originalName: artifact.fileName,
      sizeBytes: stored.sizeBytes,
      checksumSha256,
      metadata: artifact.metadata,
    });
    return {
      type: 'asset',
      assetId: saved.assetId,
      assetType: saved.assetType,
      mimeType: saved.mimeType,
    };
  }
}
