import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthenticatedIdentity } from '@genflow/database';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthenticatedIdentity;
    user: AuthenticatedIdentity;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  }

  interface FastifyRequest {
    identity: AuthenticatedIdentity;
  }
}
