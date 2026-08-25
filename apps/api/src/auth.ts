import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { createId, success } from '@genflow/shared';
import { loginRequestSchema, registerRequestSchema } from '@genflow/validation';
import type { GenFlowRepository } from '@genflow/database';

function workspaceSlug(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
  return `${base || 'workspace'}-${createId().slice(0, 8)}`;
}

export function registerAuthRoutes(app: FastifyInstance, repository: GenFlowRepository): void {
  app.post('/api/auth/register', async (request, reply) => {
    const input = registerRequestSchema.parse(request.body);
    const passwordHash = await bcrypt.hash(input.password, 12);
    const registered = await repository.registerUser({
      email: input.email,
      passwordHash,
      displayName: input.displayName,
      workspaceName: input.workspaceName ?? `${input.displayName}'s workspace`,
      workspaceSlug: workspaceSlug(input.workspaceName ?? input.displayName),
    });
    const token = await reply.jwtSign(registered.identity, { expiresIn: '8h' });
    return reply.code(201).send(
      success(
        {
          token,
          user: {
            id: registered.user.id,
            email: registered.user.email,
            displayName: registered.user.displayName,
          },
          identity: registered.identity,
        },
        request.id,
      ),
    );
  });

  app.post('/api/auth/login', async (request, reply) => {
    const input = loginRequestSchema.parse(request.body);
    const found = await repository.findUserWithIdentity(input.email);
    const valid = found ? await bcrypt.compare(input.password, found.user.passwordHash) : false;
    if (!found || !valid) {
      return reply.code(401).send({
        error: { code: 'AUTH_INVALID', message: 'Email or password is incorrect.', requestId: request.id },
      });
    }
    const token = await reply.jwtSign(found.identity, { expiresIn: '8h' });
    return success(
      {
        token,
        user: { id: found.user.id, email: found.user.email, displayName: found.user.displayName },
        identity: found.identity,
      },
      request.id,
    );
  });
}
