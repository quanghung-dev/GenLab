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
  const authenticate = app.authenticate.bind(app);

  app.get('/api/projects', { onRequest: [authenticate] }, async (request) => {
    return success(await repository.listProjects(request.identity), request.id);
  });

  app.post('/api/projects', { onRequest: [authenticate] }, async (request, reply) => {
    requireEditor(request.identity.role);
    const input = projectCreateSchema.parse(request.body);
    const project = await repository.createProject(request.identity, {
      name: input.name,
      ...(input.description === undefined ? {} : { description: input.description }),
    });
    return reply.code(201).send(success(project, request.id));
  });

  app.patch<{ Params: { projectId: string } }>(
    '/api/projects/:projectId',
    { onRequest: [authenticate] },
    async (request) => {
      requireEditor(request.identity.role);
      const input = projectUpdateSchema.parse(request.body);
      const project = await repository.updateProject(request.identity, request.params.projectId, {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.description === undefined ? {} : { description: input.description }),
      });
      return success(project, request.id);
    },
  );

  app.delete<{ Params: { projectId: string } }>(
    '/api/projects/:projectId',
    { onRequest: [authenticate] },
    async (request, reply) => {
      requireEditor(request.identity.role);
      await repository.deleteProject(request.identity, request.params.projectId);
      return reply.code(204).send();
    },
  );
}
