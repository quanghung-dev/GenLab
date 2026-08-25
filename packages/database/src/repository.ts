import { AppError } from '@genflow/shared';
import type { ExecutionEvent, NodeOutputMap, WorkflowGraph } from '@genflow/workflow-types';
import type { PoolClient, QueryResultRow } from 'pg';
import type { Database, Queryable } from './database.js';
import type {
  AssetRecord,
  AuthenticatedIdentity,
  ExecutionRecord,
  NodeExecutionUpdate,
  ProjectRecord,
  UserRecord,
  WorkflowRecord,
  WorkflowVersionRecord,
} from './types.js';

interface UserRow extends QueryResultRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
}

interface ProjectRow extends QueryResultRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
}

interface WorkflowRow extends QueryResultRow {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  current_version: number;
  graph: WorkflowGraph;
  workflow_version_id: string;
  created_at: Date;
  updated_at: Date;
}

interface WorkflowVersionRow extends QueryResultRow {
  id: string;
  workflow_id: string;
  version: number;
  graph: WorkflowGraph;
  change_summary: string | null;
  created_at: Date;
}

interface ExecutionRow extends QueryResultRow {
  id: string;
  workspace_id: string;
  project_id: string;
  workflow_id: string;
  workflow_version_id: string;
  status: ExecutionRecord['status'];
  graph: WorkflowGraph;
  terminal_outputs: Readonly<Record<string, NodeOutputMap>> | null;
  error_code: string | null;
  error_message: string | null;
  cancel_requested_at: Date | null;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
}

interface AssetRow extends QueryResultRow {
  id: string;
  workspace_id: string;
  project_id: string;
  execution_id: string | null;
  type: AssetRecord['assetType'];
  mime_type: string;
  storage_key: string;
  original_name: string | null;
  size_bytes: string;
  checksum_sha256: string;
  metadata: AssetRecord['metadata'];
  created_at: Date;
}

function project(row: ProjectRow): ProjectRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function workflow(row: WorkflowRow): WorkflowRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    description: row.description,
    currentVersion: row.current_version,
    graph: row.graph,
    workflowVersionId: row.workflow_version_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function version(row: WorkflowVersionRow): WorkflowVersionRecord {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    version: row.version,
    graph: row.graph,
    changeSummary: row.change_summary,
    createdAt: row.created_at,
  };
}

function execution(row: ExecutionRow): ExecutionRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    workflowId: row.workflow_id,
    workflowVersionId: row.workflow_version_id,
    status: row.status,
    graph: row.graph,
    terminalOutputs: row.terminal_outputs,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    cancelRequestedAt: row.cancel_requested_at,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

function asset(row: AssetRow): AssetRecord {
  return {
    type: 'asset',
    assetId: row.id,
    assetType: row.type,
    mimeType: row.mime_type,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    executionId: row.execution_id,
    storageKey: row.storage_key,
    originalName: row.original_name,
    sizeBytes: Number(row.size_bytes),
    checksumSha256: row.checksum_sha256,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

async function insertGraphSnapshot(
  client: PoolClient,
  workspaceId: string,
  workflowVersionId: string,
  graph: WorkflowGraph,
): Promise<void> {
  for (const node of graph.nodes) {
    await client.query(
      `INSERT INTO workflow_nodes
       (workspace_id, workflow_version_id, node_key, node_type, position, config, disabled)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)`,
      [workspaceId, workflowVersionId, node.id, node.type, JSON.stringify(node.position), JSON.stringify(node.config), node.disabled],
    );
  }
  for (const edge of graph.edges) {
    await client.query(
      `INSERT INTO workflow_edges
       (workspace_id, workflow_version_id, edge_key, source_node_key, source_port, target_node_key, target_port)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [workspaceId, workflowVersionId, edge.id, edge.source, edge.sourcePort, edge.target, edge.targetPort],
    );
  }
}

export class GenFlowRepository {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  async registerUser(input: {
    email: string;
    passwordHash: string;
    displayName: string;
    workspaceName: string;
    workspaceSlug: string;
  }): Promise<{ user: UserRecord; identity: AuthenticatedIdentity }> {
    return this.#database.transaction(async (client) => {
      const userResult = await client.query<UserRow>(
        `INSERT INTO users (email, password_hash, display_name)
         VALUES ($1, $2, $3)
         RETURNING id, email, password_hash, display_name`,
        [input.email, input.passwordHash, input.displayName],
      );
      const user = userResult.rows[0];
      if (!user) throw new AppError({ code: 'INTERNAL_ERROR', message: 'User was not created.' });
      const workspaceResult = await client.query<{ id: string }>(
        `INSERT INTO workspaces (name, slug) VALUES ($1, $2) RETURNING id`,
        [input.workspaceName, input.workspaceSlug],
      );
      const workspace = workspaceResult.rows[0];
      if (!workspace) throw new AppError({ code: 'INTERNAL_ERROR', message: 'Workspace was not created.' });
      await client.query(
        `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'OWNER')`,
        [workspace.id, user.id],
      );
      return {
        user: { id: user.id, email: user.email, passwordHash: user.password_hash, displayName: user.display_name },
        identity: { userId: user.id, workspaceId: workspace.id, role: 'OWNER' },
      };
    });
  }

  async findUserWithIdentity(email: string): Promise<{ user: UserRecord; identity: AuthenticatedIdentity } | null> {
    const result = await this.#database.query<UserRow & { workspace_id: string; role: AuthenticatedIdentity['role'] }>(
      `SELECT u.id, u.email, u.password_hash, u.display_name, wm.workspace_id, wm.role
       FROM users u
       JOIN workspace_members wm ON wm.user_id = u.id
       WHERE u.email = $1
       ORDER BY CASE wm.role WHEN 'OWNER' THEN 0 ELSE 1 END, wm.created_at
       LIMIT 1`,
      [email],
    );
    const row = result.rows[0];
    return row
      ? {
          user: { id: row.id, email: row.email, passwordHash: row.password_hash, displayName: row.display_name },
          identity: { userId: row.id, workspaceId: row.workspace_id, role: row.role },
        }
      : null;
  }

  async listProjects(identity: AuthenticatedIdentity): Promise<readonly ProjectRecord[]> {
    const result = await this.#database.query<ProjectRow>(
      `SELECT id, workspace_id, name, description, created_at, updated_at
       FROM projects WHERE workspace_id = $1 ORDER BY updated_at DESC`,
      [identity.workspaceId],
    );
    return result.rows.map(project);
  }

  async createProject(identity: AuthenticatedIdentity, input: { name: string; description?: string }): Promise<ProjectRecord> {
    const result = await this.#database.query<ProjectRow>(
      `INSERT INTO projects (workspace_id, name, description, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, workspace_id, name, description, created_at, updated_at`,
      [identity.workspaceId, input.name, input.description ?? null, identity.userId],
    );
    const row = result.rows[0];
    if (!row) throw new AppError({ code: 'INTERNAL_ERROR', message: 'Project was not created.' });
    return project(row);
  }

  async updateProject(
    identity: AuthenticatedIdentity,
    projectId: string,
    input: { name?: string; description?: string },
  ): Promise<ProjectRecord> {
    const result = await this.#database.query<ProjectRow>(
      `UPDATE projects SET
         name = COALESCE($3, name),
         description = CASE WHEN $4::boolean THEN $5 ELSE description END,
         updated_at = now()
       WHERE id = $1 AND workspace_id = $2
       RETURNING id, workspace_id, name, description, created_at, updated_at`,
      [projectId, identity.workspaceId, input.name ?? null, 'description' in input, input.description ?? null],
    );
    const row = result.rows[0];
    if (!row) throw new AppError({ code: 'NOT_FOUND', message: 'Project not found.', statusCode: 404 });
    return project(row);
  }

  async deleteProject(identity: AuthenticatedIdentity, projectId: string): Promise<void> {
    const result = await this.#database.query(
      `DELETE FROM projects WHERE id = $1 AND workspace_id = $2`,
      [projectId, identity.workspaceId],
    );
    if (result.rowCount === 0) throw new AppError({ code: 'NOT_FOUND', message: 'Project not found.', statusCode: 404 });
  }

  async listWorkflows(identity: AuthenticatedIdentity, projectId: string): Promise<readonly WorkflowRecord[]> {
    const result = await this.#database.query<WorkflowRow>(
      `SELECT w.id, w.project_id, w.name, w.description, w.current_version,
              wv.graph, wv.id AS workflow_version_id, w.created_at, w.updated_at
       FROM workflows w
       JOIN workflow_versions wv ON wv.workflow_id = w.id AND wv.version = w.current_version
       WHERE w.workspace_id = $1 AND w.project_id = $2
       ORDER BY w.updated_at DESC`,
      [identity.workspaceId, projectId],
    );
    return result.rows.map(workflow);
  }

  async createWorkflow(
    identity: AuthenticatedIdentity,
    projectId: string,
    input: { name: string; description?: string; graph: WorkflowGraph },
  ): Promise<WorkflowRecord> {
    return this.#database.transaction(async (client) => {
      const projectExists = await client.query(
        `SELECT 1 FROM projects WHERE id = $1 AND workspace_id = $2`,
        [projectId, identity.workspaceId],
      );
      if (projectExists.rowCount === 0) throw new AppError({ code: 'NOT_FOUND', message: 'Project not found.', statusCode: 404 });
      const workflowResult = await client.query<{ id: string; created_at: Date; updated_at: Date }>(
        `INSERT INTO workflows (workspace_id, project_id, name, description, current_version, created_by)
         VALUES ($1, $2, $3, $4, 1, $5)
         RETURNING id, created_at, updated_at`,
        [identity.workspaceId, projectId, input.name, input.description ?? null, identity.userId],
      );
      const created = workflowResult.rows[0];
      if (!created) throw new AppError({ code: 'INTERNAL_ERROR', message: 'Workflow was not created.' });
      const versionResult = await client.query<{ id: string }>(
        `INSERT INTO workflow_versions
         (workspace_id, workflow_id, version, schema_version, graph, change_summary, created_by)
         VALUES ($1, $2, 1, $3, $4::jsonb, 'Initial version', $5)
         RETURNING id`,
        [identity.workspaceId, created.id, input.graph.schemaVersion, JSON.stringify(input.graph), identity.userId],
      );
      const createdVersion = versionResult.rows[0];
      if (!createdVersion) throw new AppError({ code: 'INTERNAL_ERROR', message: 'Workflow version was not created.' });
      await insertGraphSnapshot(client, identity.workspaceId, createdVersion.id, input.graph);
      return {
        id: created.id,
        projectId,
        name: input.name,
        description: input.description ?? null,
        currentVersion: 1,
        graph: input.graph,
        workflowVersionId: createdVersion.id,
        createdAt: created.created_at,
        updatedAt: created.updated_at,
      };
    });
  }

  async getWorkflow(identity: AuthenticatedIdentity, workflowId: string): Promise<WorkflowRecord> {
    const result = await this.#database.query<WorkflowRow>(
      `SELECT w.id, w.project_id, w.name, w.description, w.current_version,
              wv.graph, wv.id AS workflow_version_id, w.created_at, w.updated_at
       FROM workflows w
       JOIN workflow_versions wv ON wv.workflow_id = w.id AND wv.version = w.current_version
       WHERE w.id = $1 AND w.workspace_id = $2`,
      [workflowId, identity.workspaceId],
    );
    const row = result.rows[0];
    if (!row) throw new AppError({ code: 'NOT_FOUND', message: 'Workflow not found.', statusCode: 404 });
    return workflow(row);
  }

  async saveWorkflowVersion(
    identity: AuthenticatedIdentity,
    workflowId: string,
    input: { graph: WorkflowGraph; expectedVersion: number; changeSummary?: string },
  ): Promise<WorkflowVersionRecord> {
    return this.#database.transaction(async (client) => {
      const locked = await client.query<{ current_version: number }>(
        `SELECT current_version FROM workflows
         WHERE id = $1 AND workspace_id = $2 FOR UPDATE`,
        [workflowId, identity.workspaceId],
      );
      const current = locked.rows[0]?.current_version;
      if (current === undefined) throw new AppError({ code: 'NOT_FOUND', message: 'Workflow not found.', statusCode: 404 });
      if (current !== input.expectedVersion) {
        throw new AppError({
          code: 'CONFLICT',
          message: `Workflow changed since version ${input.expectedVersion}.`,
          statusCode: 409,
          details: { currentVersion: current },
        });
      }
      const nextVersion = current + 1;
      const result = await client.query<WorkflowVersionRow>(
        `INSERT INTO workflow_versions
         (workspace_id, workflow_id, version, schema_version, graph, change_summary, created_by)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
         RETURNING id, workflow_id, version, graph, change_summary, created_at`,
        [identity.workspaceId, workflowId, nextVersion, input.graph.schemaVersion, JSON.stringify(input.graph), input.changeSummary ?? null, identity.userId],
      );
      const row = result.rows[0];
      if (!row) throw new AppError({ code: 'INTERNAL_ERROR', message: 'Workflow version was not created.' });
      await insertGraphSnapshot(client, identity.workspaceId, row.id, input.graph);
      await client.query(
        `UPDATE workflows SET current_version = $3, name = $4, updated_at = now()
         WHERE id = $1 AND workspace_id = $2`,
        [workflowId, identity.workspaceId, nextVersion, input.graph.name],
      );
      return version(row);
    });
  }

  async listWorkflowVersions(identity: AuthenticatedIdentity, workflowId: string): Promise<readonly WorkflowVersionRecord[]> {
    const result = await this.#database.query<WorkflowVersionRow>(
      `SELECT id, workflow_id, version, graph, change_summary, created_at
       FROM workflow_versions WHERE workflow_id = $1 AND workspace_id = $2 ORDER BY version DESC`,
      [workflowId, identity.workspaceId],
    );
    return result.rows.map(version);
  }

  async createExecution(
    identity: AuthenticatedIdentity,
    workflowId: string,
    input: { workflowVersionId?: string; idempotencyKey?: string; inputOverrides: Record<string, unknown> },
  ): Promise<ExecutionRecord> {
    const result = await this.#database.query<ExecutionRow>(
      `WITH selected AS (
         SELECT w.project_id, w.id AS workflow_id, wv.id AS workflow_version_id, wv.graph
         FROM workflows w
         JOIN workflow_versions wv ON wv.workflow_id = w.id
         WHERE w.id = $1 AND w.workspace_id = $2
           AND (($3::uuid IS NULL AND wv.version = w.current_version) OR wv.id = $3::uuid)
         LIMIT 1
       )
       INSERT INTO workflow_executions
       (workspace_id, project_id, workflow_id, workflow_version_id, status, idempotency_key,
        input_overrides, queued_at, created_by)
       SELECT $2, project_id, workflow_id, workflow_version_id, 'QUEUED', $4, $5::jsonb, now(), $6 FROM selected
       ON CONFLICT (workspace_id, idempotency_key) DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
       RETURNING id, workspace_id, project_id, workflow_id, workflow_version_id, status,
                 (SELECT graph FROM selected) AS graph, terminal_outputs, error_code, error_message,
                 cancel_requested_at, created_at, started_at, finished_at`,
      [workflowId, identity.workspaceId, input.workflowVersionId ?? null, input.idempotencyKey ?? null, JSON.stringify(input.inputOverrides), identity.userId],
    );
    const row = result.rows[0];
    if (!row) throw new AppError({ code: 'NOT_FOUND', message: 'Workflow version not found.', statusCode: 404 });
    return execution(row);
  }

  async getExecution(identity: AuthenticatedIdentity, executionId: string): Promise<ExecutionRecord> {
    return this.getExecutionForWorker(executionId, identity.workspaceId);
  }

  async listExecutions(identity: AuthenticatedIdentity, projectId?: string): Promise<readonly QueryResultRow[]> {
    const result = await this.#database.query(
      `SELECT e.id, e.project_id AS "projectId", e.workflow_id AS "workflowId",
              w.name AS "workflowName", wv.version AS "workflowVersion", e.status,
              e.error_code AS "errorCode", e.error_message AS "errorMessage",
              e.created_at AS "createdAt", e.started_at AS "startedAt", e.finished_at AS "finishedAt"
       FROM workflow_executions e
       JOIN workflows w ON w.id = e.workflow_id
       JOIN workflow_versions wv ON wv.id = e.workflow_version_id
       WHERE e.workspace_id = $1 AND ($2::uuid IS NULL OR e.project_id = $2::uuid)
       ORDER BY e.created_at DESC LIMIT 200`,
      [identity.workspaceId, projectId ?? null],
    );
    return result.rows;
  }

  async getExecutionForWorker(executionId: string, workspaceId?: string): Promise<ExecutionRecord> {
    const result = await this.#database.query<ExecutionRow>(
      `SELECT e.id, e.workspace_id, e.project_id, e.workflow_id, e.workflow_version_id, e.status,
              wv.graph, e.terminal_outputs, e.error_code, e.error_message, e.cancel_requested_at,
              e.created_at, e.started_at, e.finished_at
       FROM workflow_executions e
       JOIN workflow_versions wv ON wv.id = e.workflow_version_id
       WHERE e.id = $1 AND ($2::uuid IS NULL OR e.workspace_id = $2::uuid)`,
      [executionId, workspaceId ?? null],
    );
    const row = result.rows[0];
    if (!row) throw new AppError({ code: 'NOT_FOUND', message: 'Execution not found.', statusCode: 404 });
    return execution(row);
  }

  async requestCancellation(identity: AuthenticatedIdentity, executionId: string): Promise<void> {
    const result = await this.#database.query(
      `UPDATE workflow_executions
       SET cancel_requested_at = now(),
           status = CASE WHEN status IN ('PENDING', 'QUEUED') THEN 'CANCELLED' ELSE status END,
           finished_at = CASE WHEN status IN ('PENDING', 'QUEUED') THEN now() ELSE finished_at END
       WHERE id = $1 AND workspace_id = $2 AND status IN ('PENDING', 'QUEUED', 'RUNNING')`,
      [executionId, identity.workspaceId],
    );
    if (result.rowCount === 0) throw new AppError({ code: 'CONFLICT', message: 'Execution cannot be cancelled.', statusCode: 409 });
  }

  async requeueExecution(identity: AuthenticatedIdentity, executionId: string): Promise<ExecutionRecord> {
    const result = await this.#database.query<ExecutionRow>(
      `UPDATE workflow_executions e
       SET status = 'QUEUED', error_code = NULL, error_message = NULL,
           cancel_requested_at = NULL, queued_at = now(), started_at = NULL, finished_at = NULL
       FROM workflow_versions wv
       WHERE e.id = $1 AND e.workspace_id = $2 AND e.status IN ('FAILED', 'CANCELLED')
         AND wv.id = e.workflow_version_id
       RETURNING e.id, e.workspace_id, e.project_id, e.workflow_id, e.workflow_version_id,
                 e.status, wv.graph, e.terminal_outputs, e.error_code, e.error_message,
                 e.cancel_requested_at, e.created_at, e.started_at, e.finished_at`,
      [executionId, identity.workspaceId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new AppError({ code: 'CONFLICT', message: 'Only failed or cancelled executions can be retried.', statusCode: 409 });
    }
    return execution(row);
  }

  async markExecutionRunning(executionId: string): Promise<void> {
    await this.#database.query(
      `UPDATE workflow_executions SET status = 'RUNNING', started_at = COALESCE(started_at, now())
       WHERE id = $1 AND status = 'QUEUED'`,
      [executionId],
    );
  }

  async markExecutionCompleted(executionId: string, outputs: Readonly<Record<string, NodeOutputMap>>): Promise<void> {
    await this.#database.query(
      `UPDATE workflow_executions
       SET status = 'SUCCESS', terminal_outputs = $2::jsonb, finished_at = now()
       WHERE id = $1`,
      [executionId, JSON.stringify(outputs)],
    );
  }

  async markExecutionFailed(executionId: string, code: string, message: string): Promise<void> {
    await this.#database.query(
      `UPDATE workflow_executions
       SET status = CASE WHEN cancel_requested_at IS NULL THEN 'FAILED' ELSE 'CANCELLED' END,
           error_code = $2, error_message = $3, finished_at = now()
       WHERE id = $1`,
      [executionId, code, message],
    );
  }

  async upsertNodeExecution(executionRecord: ExecutionRecord, nodeType: string, update: NodeExecutionUpdate): Promise<void> {
    await this.#database.query(
      `INSERT INTO node_executions
       (id, workspace_id, execution_id, node_key, node_type, attempt, status, outputs,
        error_code, error_message, started_at, finished_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12)
       ON CONFLICT (execution_id, node_key, attempt) DO UPDATE SET
         status = EXCLUDED.status,
         outputs = COALESCE(EXCLUDED.outputs, node_executions.outputs),
         error_code = EXCLUDED.error_code,
         error_message = EXCLUDED.error_message,
         started_at = COALESCE(node_executions.started_at, EXCLUDED.started_at),
         finished_at = EXCLUDED.finished_at`,
      [
        update.nodeExecutionId,
        executionRecord.workspaceId,
        executionRecord.id,
        update.nodeId,
        nodeType,
        update.attempt,
        update.status,
        update.outputs ? JSON.stringify(update.outputs) : null,
        update.error?.code ?? null,
        update.error?.message ?? null,
        update.startedAt ?? null,
        update.finishedAt ?? null,
      ],
    );
  }

  async appendEvent(workspaceId: string, event: ExecutionEvent): Promise<void> {
    await this.#database.query(
      `INSERT INTO execution_logs
       (workspace_id, execution_id, node_execution_id, level, event_type, message, context)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        workspaceId,
        event.executionId,
        event.nodeExecutionId ?? null,
        event.type.endsWith('failed') ? 'error' : 'info',
        event.type,
        typeof event.payload.message === 'string' ? event.payload.message : event.type,
        JSON.stringify(event.payload),
      ],
    );
  }

  async listExecutionLogs(identity: AuthenticatedIdentity, executionId: string): Promise<readonly QueryResultRow[]> {
    const result = await this.#database.query(
      `SELECT l.id, l.level, l.event_type AS "eventType", l.message, l.context, l.created_at AS "createdAt"
       FROM execution_logs l
       JOIN workflow_executions e ON e.id = l.execution_id
       WHERE l.execution_id = $1 AND e.workspace_id = $2
       ORDER BY l.created_at, l.id`,
      [executionId, identity.workspaceId],
    );
    return result.rows;
  }

  async listNodeExecutions(identity: AuthenticatedIdentity, executionId: string): Promise<readonly QueryResultRow[]> {
    const result = await this.#database.query(
      `SELECT n.id, n.node_key AS "nodeId", n.node_type AS "nodeType", n.attempt,
              n.status, n.outputs, n.error_code AS "errorCode", n.error_message AS "errorMessage",
              n.started_at AS "startedAt", n.finished_at AS "finishedAt"
       FROM node_executions n
       JOIN workflow_executions e ON e.id = n.execution_id
       WHERE n.execution_id = $1 AND e.workspace_id = $2
       ORDER BY n.created_at, n.attempt`,
      [executionId, identity.workspaceId],
    );
    return result.rows;
  }

  async createAsset(input: {
    workspaceId: string;
    projectId: string;
    executionId: string;
    nodeExecutionId: string;
    assetType: AssetRecord['assetType'];
    mimeType: string;
    storageKey: string;
    originalName: string;
    sizeBytes: number;
    checksumSha256: string;
    metadata: AssetRecord['metadata'];
  }): Promise<AssetRecord> {
    const result = await this.#database.query<AssetRow>(
      `INSERT INTO assets
       (workspace_id, project_id, execution_id, node_execution_id, type, mime_type, storage_key,
        original_name, size_bytes, checksum_sha256, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
       RETURNING id, workspace_id, project_id, execution_id, type, mime_type, storage_key,
                 original_name, size_bytes, checksum_sha256, metadata, created_at`,
      [
        input.workspaceId,
        input.projectId,
        input.executionId,
        input.nodeExecutionId,
        input.assetType,
        input.mimeType,
        input.storageKey,
        input.originalName,
        input.sizeBytes,
        input.checksumSha256,
        JSON.stringify(input.metadata),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new AppError({ code: 'ASSET_UPLOAD_FAILED', message: 'Asset metadata was not saved.' });
    return asset(row);
  }

  async listAssets(identity: AuthenticatedIdentity, projectId?: string): Promise<readonly AssetRecord[]> {
    const result = await this.#database.query<AssetRow>(
      `SELECT id, workspace_id, project_id, execution_id, type, mime_type, storage_key,
              original_name, size_bytes, checksum_sha256, metadata, created_at
       FROM assets
       WHERE workspace_id = $1 AND ($2::uuid IS NULL OR project_id = $2::uuid)
       ORDER BY created_at DESC LIMIT 200`,
      [identity.workspaceId, projectId ?? null],
    );
    return result.rows.map(asset);
  }

  async getAsset(identity: AuthenticatedIdentity, assetId: string): Promise<AssetRecord> {
    const result = await this.#database.query<AssetRow>(
      `SELECT id, workspace_id, project_id, execution_id, type, mime_type, storage_key,
              original_name, size_bytes, checksum_sha256, metadata, created_at
       FROM assets WHERE id = $1 AND workspace_id = $2`,
      [assetId, identity.workspaceId],
    );
    const row = result.rows[0];
    if (!row) throw new AppError({ code: 'NOT_FOUND', message: 'Asset not found.', statusCode: 404 });
    return asset(row);
  }

  async getCredential(workspaceId: string, credentialId: string): Promise<{
    ciphertext: Buffer;
    iv: Buffer;
    authTag: Buffer;
  } | null> {
    const result = await this.#database.query<{ ciphertext: Buffer; iv: Buffer; auth_tag: Buffer }>(
      `SELECT ciphertext, iv, auth_tag FROM credentials WHERE id = $1 AND workspace_id = $2`,
      [credentialId, workspaceId],
    );
    const row = result.rows[0];
    return row ? { ciphertext: row.ciphertext, iv: row.iv, authTag: row.auth_tag } : null;
  }

  queryable(): Queryable {
    return this.#database;
  }
}
