import type {
  AssetReference,
  ExecutionStatus,
  JsonValue,
  NodeExecutionStatus,
  NodeOutputMap,
  WorkflowGraph,
} from '@genflow/workflow-types';

export interface AuthenticatedIdentity {
  readonly userId: string;
  readonly workspaceId: string;
  readonly role: 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER';
}

export interface UserRecord {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly displayName: string;
}

export interface ProjectRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly description: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface WorkflowRecord {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly description: string | null;
  readonly currentVersion: number;
  readonly graph: WorkflowGraph;
  readonly workflowVersionId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface WorkflowVersionRecord {
  readonly id: string;
  readonly workflowId: string;
  readonly version: number;
  readonly graph: WorkflowGraph;
  readonly changeSummary: string | null;
  readonly createdAt: Date;
}

export interface ExecutionRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly workflowId: string;
  readonly workflowVersionId: string;
  readonly status: ExecutionStatus;
  readonly graph: WorkflowGraph;
  readonly terminalOutputs: Readonly<Record<string, NodeOutputMap>> | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly cancelRequestedAt: Date | null;
  readonly createdAt: Date;
  readonly startedAt: Date | null;
  readonly finishedAt: Date | null;
}

export interface NodeExecutionUpdate {
  readonly nodeExecutionId: string;
  readonly nodeId: string;
  readonly attempt: number;
  readonly status: NodeExecutionStatus;
  readonly outputs?: NodeOutputMap;
  readonly error?: { code: string; message: string };
  readonly startedAt?: string;
  readonly finishedAt?: string;
}

export interface AssetRecord extends AssetReference {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly executionId: string | null;
  readonly storageKey: string;
  readonly originalName: string | null;
  readonly sizeBytes: number;
  readonly checksumSha256: string;
  readonly metadata: Readonly<Record<string, JsonValue>>;
  readonly createdAt: Date;
}
