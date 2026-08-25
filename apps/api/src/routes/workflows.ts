import type { FastifyInstance } from 'fastify';
import type { GenFlowRepository } from '@genflow/database';
import type { ExecutionQueue } from '../execution-queue.js';
import { AppError, success } from '@genflow/shared';
import {
  executionCreateSchema,
  workflowCreateSchema,
  workflowValidationRequestSchema,
  workflowVersionCreateSchema,
} from '@genflow/validation';
import {
  createDefaultNodeRegistry,
  validateWorkflow,
  workflowTemplates,
} from '@genflow/workflow-core';
import type { WorkflowGraph } from '@genflow/workflow-types';

const nodeRegistry = createDefaultNodeRegistry();

function requireEditor(role: string): void {
  if (!['OWNER', 'ADMIN', 'EDITOR'].includes(role)) {
    throw new AppError({ code: 'FORBIDDEN', message: 'Editor permission is required.', statusCode: 403 });
  }
}

function initialGraph(name: string): WorkflowGraph {
  return { schemaVersion: 1, name, nodes: [], edges: [] };
}

export function registerWorkflowRoutes(
  app: FastifyInstance,
  repository: GenFlowRepository,
  queue: ExecutionQueue,
): void {
  app.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/workflows',
    { onRequest: [app.authenticate] },
    async (request) => success(await repository.listWorkflows(request.identity, request.params.projectId), request.id),
  );

  app.post<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/workflows',
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      requireEditor(request.identity.role);
      const input = workflowCreateSchema.parse(request.body);
      const template = input.templateId
        ? workflowTemplates.find((candidate) => candidate.id === input.templateId)
        : undefined;
      if (input.templateId && !template) {
        throw new AppError({ code: 'INVALID_INPUT', message: 'Unknown workflow template.', statusCode: 422 });
      }
      const graph = structuredClone(input.graph ?? template?.graph ?? initialGraph(input.name));
      graph.name = input.name;
      const created = await repository.createWorkflow(request.identity, request.params.projectId, {
        name: input.name,
        ...(input.description ? { description: input.description } : {}),
        graph,
      });
      return reply.code(201).send(success(created, request.id));
    },
  );

  app.get<{ Params: { workflowId: string } }>(
    '/api/workflows/:workflowId',
    { onRequest: [app.authenticate] },
    async (request) => success(await repository.getWorkflow(request.identity, request.params.workflowId), request.id),
  );

  app.get<{ Params: { workflowId: string } }>(
    '/api/workflows/:workflowId/versions',
    { onRequest: [app.authenticate] },
    async (request) =>
      success(await repository.listWorkflowVersions(request.identity, request.params.workflowId), request.id),
  );

  app.post<{ Params: { workflowId: string } }>(
    '/api/workflows/:workflowId/versions',
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      requireEditor(request.identity.role);
      const input = workflowVersionCreateSchema.parse(request.body);
      const saved = await repository.saveWorkflowVersion(request.identity, request.params.workflowId, {
        graph: input.graph,
        expectedVersion: input.expectedVersion,
        ...(input.changeSummary === undefined ? {} : { changeSummary: input.changeSummary }),
      });
      const validation = validateWorkflow(input.graph, nodeRegistry);
      return reply.code(201).send(success({ version: saved, validation }, request.id));
    },
  );

  app.post<{ Params: { workflowId: string } }>(
    '/api/workflows/:workflowId/validate',
    { onRequest: [app.authenticate] },
    async (request) => {
      await repository.getWorkflow(request.identity, request.params.workflowId);
      const input = workflowValidationRequestSchema.parse(request.body);
      return success(validateWorkflow(input.graph, nodeRegistry), request.id);
    },
  );

  app.post<{ Params: { workflowId: string } }>(
    '/api/workflows/:workflowId/executions',
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      requireEditor(request.identity.role);
      const input = executionCreateSchema.parse(request.body);
      const versions = await repository.listWorkflowVersions(request.identity, request.params.workflowId);
      const selected = input.workflowVersionId
        ? versions.find((candidate) => candidate.id === input.workflowVersionId)
        : versions[0];
      if (!selected) throw new AppError({ code: 'NOT_FOUND', message: 'Workflow version not found.', statusCode: 404 });
      const validation = validateWorkflow(selected.graph, nodeRegistry);
      if (!validation.valid) {
        throw new AppError({
          code: 'WORKFLOW_VALIDATION_FAILED',
          message: 'Workflow must be valid before execution.',
          statusCode: 422,
          details: validation.issues,
        });
      }
      const execution = await repository.createExecution(request.identity, request.params.workflowId, {
        workflowVersionId: selected.id,
        ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
        inputOverrides: input.inputOverrides,
      });
      try {
        await queue.enqueue({ executionId: execution.id, workspaceId: execution.workspaceId });
      } catch (error) {
        await repository.markExecutionFailed(execution.id, 'QUEUE_UNAVAILABLE', 'Execution could not be queued.');
        throw error;
      }
      return reply.code(202).send(
        success(
          { executionId: execution.id, workflowVersionId: execution.workflowVersionId, status: execution.status },
          request.id,
        ),
      );
    },
  );

  app.get('/api/templates', { onRequest: [app.authenticate] }, async (request) =>
    success(workflowTemplates, request.id),
  );
  app.get('/api/node-definitions', { onRequest: [app.authenticate] }, async (request) =>
    success(
      nodeRegistry.list().map(({ configSchema, ...definition }) => ({
        ...definition,
        defaultConfig: configSchema.parse({}),
      })),
      request.id,
    ),
  );
}
