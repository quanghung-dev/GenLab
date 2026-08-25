import type { FastifyInstance } from 'fastify';
import type { GenFlowRepository } from '@genflow/database';
import { success } from '@genflow/shared';
import type { ExecutionQueue } from '../execution-queue.js';
import type { EventBroker } from '../event-broker.js';

export function registerExecutionRoutes(
  app: FastifyInstance,
  repository: GenFlowRepository,
  queue: ExecutionQueue,
  events: EventBroker,
): void {
  const authenticate = app.authenticate.bind(app);

  app.get<{ Querystring: { projectId?: string } }>(
    '/api/executions',
    { onRequest: [authenticate] },
    async (request) =>
      success(await repository.listExecutions(request.identity, request.query.projectId), request.id),
  );

  app.get<{ Params: { executionId: string } }>(
    '/api/executions/:executionId',
    { onRequest: [authenticate] },
    async (request) => {
      const execution = await repository.getExecution(request.identity, request.params.executionId);
      const nodes = await repository.listNodeExecutions(request.identity, request.params.executionId);
      return success({ ...execution, nodes }, request.id);
    },
  );

  app.get<{ Params: { executionId: string } }>(
    '/api/executions/:executionId/logs',
    { onRequest: [authenticate] },
    async (request) =>
      success(await repository.listExecutionLogs(request.identity, request.params.executionId), request.id),
  );

  app.post<{ Params: { executionId: string } }>(
    '/api/executions/:executionId/cancel',
    { onRequest: [authenticate] },
    async (request, reply) => {
      await repository.requestCancellation(request.identity, request.params.executionId);
      return reply.code(202).send(success({ status: 'CANCELLATION_REQUESTED' }, request.id));
    },
  );

  app.post<{ Params: { executionId: string } }>(
    '/api/executions/:executionId/retry',
    { onRequest: [authenticate] },
    async (request, reply) => {
      const execution = await repository.requeueExecution(request.identity, request.params.executionId);
      await queue.enqueue({ executionId: execution.id, workspaceId: execution.workspaceId });
      return reply.code(202).send(success({ executionId: execution.id, status: execution.status }, request.id));
    },
  );

  app.get<{ Params: { executionId: string } }>(
    '/api/executions/:executionId/events',
    { onRequest: [authenticate] },
    async (request, reply) => {
      await repository.getExecution(request.identity, request.params.executionId);
      reply.hijack();
      reply.raw.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      });
      reply.raw.write(`event: connected\ndata: ${JSON.stringify({ executionId: request.params.executionId })}\n\n`);
      const unsubscribe = await events.subscribe(request.params.executionId, (event) => {
        reply.raw.write(`id: ${event.eventId}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      });
      const heartbeat = setInterval(() => reply.raw.write(': heartbeat\n\n'), 15_000);
      await new Promise<void>((resolve) => {
        request.raw.once('close', () => {
          clearInterval(heartbeat);
          void unsubscribe().finally(resolve);
        });
      });
    },
  );
}
