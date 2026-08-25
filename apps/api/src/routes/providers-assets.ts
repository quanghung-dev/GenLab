import type { FastifyInstance } from 'fastify';
import type { AssetStorage } from '@genflow/asset-storage';
import type { GenFlowRepository } from '@genflow/database';
import type { ProviderRegistry } from '@genflow/provider-sdk';
import { AppError, success } from '@genflow/shared';

export function registerProviderAndAssetRoutes(
  app: FastifyInstance,
  repository: GenFlowRepository,
  providers: ProviderRegistry,
  storage: AssetStorage,
): void {
  app.get('/api/providers', { onRequest: [app.authenticate] }, async (request) =>
    success(providers.list(), request.id),
  );

  app.get<{ Params: { providerId: string } }>(
    '/api/providers/:providerId/models',
    { onRequest: [app.authenticate] },
    async (request) => success(providers.get(request.params.providerId).models, request.id),
  );

  app.post<{ Params: { providerId: string } }>(
    '/api/providers/:providerId/test',
    { onRequest: [app.authenticate] },
    async (request) => {
      const provider = providers.get(request.params.providerId);
      return success({ ok: provider.enabled, capabilities: Object.keys(provider.handlers) }, request.id);
    },
  );

  app.get<{ Querystring: { projectId?: string } }>(
    '/api/assets',
    { onRequest: [app.authenticate] },
    async (request) =>
      success(await repository.listAssets(request.identity, request.query.projectId), request.id),
  );

  app.get<{ Params: { assetId: string } }>(
    '/api/assets/:assetId',
    { onRequest: [app.authenticate] },
    async (request) => success(await repository.getAsset(request.identity, request.params.assetId), request.id),
  );

  app.get<{ Params: { assetId: string } }>(
    '/api/assets/:assetId/content',
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const asset = await repository.getAsset(request.identity, request.params.assetId);
      if (asset.sizeBytes > 100 * 1024 * 1024) {
        throw new AppError({ code: 'INVALID_INPUT', message: 'Asset is too large for direct streaming.', statusCode: 413 });
      }
      const content = await storage.get(asset.storageKey);
      reply.header('content-disposition', `inline; filename="${(asset.originalName ?? asset.assetId).replace(/["\r\n]/g, '')}"`);
      return reply.type(asset.mimeType).send(Buffer.from(content));
    },
  );
}
