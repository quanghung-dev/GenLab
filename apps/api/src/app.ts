import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import type { AssetStorage } from '@genflow/asset-storage';
import type { GenFlowRepository } from '@genflow/database';
import type { ProviderRegistry } from '@genflow/provider-sdk';
import { AppError, redactSecrets, toAppError } from '@genflow/shared';
import type { ApiConfig } from './config.js';
import type { EventBroker } from './event-broker.js';
import type { ExecutionQueue } from './execution-queue.js';
import { registerAuthRoutes } from './auth.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerWorkflowRoutes } from './routes/workflows.js';
import { registerExecutionRoutes } from './routes/executions.js';
import { registerProviderAndAssetRoutes } from './routes/providers-assets.js';

export interface ApiDependencies {
  readonly config: ApiConfig;
  readonly repository: GenFlowRepository;
  readonly queue: ExecutionQueue;
  readonly events: EventBroker;
  readonly providers: ProviderRegistry;
  readonly storage: AssetStorage;
}

function isPostgresUniqueError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

export async function buildApp(dependencies: ApiDependencies): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: dependencies.config.NODE_ENV === 'production' ? 'info' : 'debug',
      redact: ['req.headers.authorization', '*.password', '*.token', '*.credentials'],
    },
    bodyLimit: 2 * 1024 * 1024,
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  });

  await app.register(cors, {
    origin: dependencies.config.WEB_ORIGIN,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['authorization', 'content-type', 'x-request-id', 'idempotency-key'],
  });
  await app.register(rateLimit, { max: 240, timeWindow: '1 minute' });
  await app.register(jwt, { secret: dependencies.config.JWT_SECRET });

  app.decorate('authenticate', async (request, reply) => {
    try {
      await request.jwtVerify();
      request.identity = request.user;
    } catch {
      await reply.code(401).send({
        error: { code: 'AUTH_REQUIRED', message: 'Authentication is required.', requestId: request.id },
      });
    }
  });

  app.get('/api/health', async (request) => ({
    data: { status: 'ok', version: '0.1.0' },
    meta: { requestId: request.id },
  }));

  registerAuthRoutes(app, dependencies.repository);
  registerProjectRoutes(app, dependencies.repository);
  registerWorkflowRoutes(app, dependencies.repository, dependencies.queue);
  registerExecutionRoutes(app, dependencies.repository, dependencies.queue, dependencies.events);
  registerProviderAndAssetRoutes(app, dependencies.repository, dependencies.providers, dependencies.storage);

  app.setErrorHandler((errorValue, request, reply) => {
    request.log.error(redactSecrets({ error: errorValue, requestId: request.id }));
    let error: AppError;
    if (errorValue instanceof ZodError) {
      error = new AppError({
        code: 'INVALID_INPUT',
        message: 'Request validation failed.',
        statusCode: 400,
        details: errorValue.issues,
      });
    } else if (isPostgresUniqueError(errorValue)) {
      error = new AppError({ code: 'CONFLICT', message: 'The resource already exists.', statusCode: 409 });
    } else {
      error = toAppError(errorValue);
    }
    void reply.code(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
        requestId: request.id,
      },
    });
  });

  return app;
}
