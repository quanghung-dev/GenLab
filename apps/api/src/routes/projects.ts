import type { FastifyInstance } from 'fastify';
import type { GenFlowRepository } from '@genflow/database';
import { AppError, success } from '@genflow/shared';
import { projectCreateSchema, projectUpdateSchema } from '@genflow/validation';

function requireEditor(role: string): void {
  if (!['OWNER', 'ADMIN', 'EDITOR'].includes(role)) {
    throw new AppError({ code: 'FORBIDDEN', message: 'Editor permission is required.', statusCode: 403 });
  }
}

export function registerProjectRoutes(app: FastifyInstance, repository: GenFlowRepository): void {
  app.get('/api/projects', { onRequest: [app.authenticate] }, async (request) => {
    return success(await repository.listProjects(request.identity), request.id);
  });

  app.post('/api/projects', { onRequest: [app.authenticate] }, async (request, reply) => {
    requireEditor(request.identity.role);
    const input = projectCreateSchema.parse(request.body);
    return reply.code(201).send(success(await repository.createProject(request.identity, input), request.id));
  });

  app.patch<{ Params: { projectId: string } }>(
    '/api/projects/:projectId',
    { onRequest: [app.authenticate] },
    async (request) => {
      requireEditor(request.identity.role);
      const input = projectUpdateSchema.parse(request.body);
      return success(await repository.updateProject(request.identity, request.params.projectId, input), request.id);
    },
  );

  app.delete<{ Params: { projectId: string } }>(
    '/api/projects/:projectId',
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      requireEditor(request.identity.role);
      await repository.deleteProject(request.identity, request.params.projectId);
      return reply.code(204).send();
    },
  );
}
