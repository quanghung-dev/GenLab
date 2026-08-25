CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE workspace_role AS ENUM ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER');
CREATE TYPE execution_status AS ENUM ('PENDING', 'QUEUED', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED');
CREATE TYPE node_execution_status AS ENUM ('PENDING', 'QUEUED', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED', 'SKIPPED', 'RETRYING');
CREATE TYPE asset_type AS ENUM ('image', 'video', 'audio', 'document', 'json', 'text');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name varchar(100) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL,
  slug varchar(140) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workspace_members (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role workspace_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX workspace_members_user_idx ON workspace_members(user_id);

CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name varchar(160) NOT NULL,
  description text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projects_workspace_updated_idx ON projects(workspace_id, updated_at DESC);

CREATE TABLE workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name varchar(160) NOT NULL,
  description text,
  current_version integer NOT NULL DEFAULT 0 CHECK (current_version >= 0),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX workflows_project_updated_idx ON workflows(workspace_id, project_id, updated_at DESC);

CREATE TABLE workflow_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  schema_version integer NOT NULL DEFAULT 1,
  graph jsonb NOT NULL,
  change_summary varchar(500),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, version)
);
CREATE INDEX workflow_versions_workspace_workflow_idx ON workflow_versions(workspace_id, workflow_id, version DESC);

CREATE TABLE workflow_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  workflow_version_id uuid NOT NULL REFERENCES workflow_versions(id) ON DELETE CASCADE,
  node_key varchar(120) NOT NULL,
  node_type varchar(120) NOT NULL,
  position jsonb NOT NULL,
  config jsonb NOT NULL,
  disabled boolean NOT NULL DEFAULT false,
  UNIQUE (workflow_version_id, node_key)
);
CREATE INDEX workflow_nodes_type_idx ON workflow_nodes(workspace_id, node_type);

CREATE TABLE workflow_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  workflow_version_id uuid NOT NULL REFERENCES workflow_versions(id) ON DELETE CASCADE,
  edge_key varchar(160) NOT NULL,
  source_node_key varchar(120) NOT NULL,
  source_port varchar(80) NOT NULL,
  target_node_key varchar(120) NOT NULL,
  target_port varchar(80) NOT NULL,
  UNIQUE (workflow_version_id, edge_key)
);
CREATE INDEX workflow_edges_version_idx ON workflow_edges(workspace_id, workflow_version_id);

CREATE TABLE providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  provider_key varchar(120) NOT NULL,
  display_name varchar(160) NOT NULL,
  base_url text,
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (workspace_id, provider_key)
);

CREATE TABLE provider_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  model_key varchar(160) NOT NULL,
  display_name varchar(200) NOT NULL,
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (provider_id, model_key)
);

CREATE TABLE credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider_key varchar(120) NOT NULL,
  label varchar(160) NOT NULL,
  ciphertext bytea NOT NULL,
  iv bytea NOT NULL,
  auth_tag bytea NOT NULL,
  key_version integer NOT NULL DEFAULT 1,
  last_four varchar(8),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX credentials_workspace_provider_idx ON credentials(workspace_id, provider_key);

CREATE TABLE workflow_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  workflow_version_id uuid NOT NULL REFERENCES workflow_versions(id) ON DELETE RESTRICT,
  status execution_status NOT NULL DEFAULT 'PENDING',
  idempotency_key varchar(200),
  input_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  terminal_outputs jsonb,
  error_code varchar(120),
  error_message text,
  cancel_requested_at timestamptz,
  queued_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (workspace_id, idempotency_key)
);
CREATE INDEX executions_workspace_created_idx ON workflow_executions(workspace_id, created_at DESC);
CREATE INDEX executions_workflow_status_idx ON workflow_executions(workspace_id, workflow_id, status);

CREATE TABLE node_executions (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  execution_id uuid NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  node_key varchar(120) NOT NULL,
  node_type varchar(120) NOT NULL,
  attempt integer NOT NULL CHECK (attempt >= 0),
  status node_execution_status NOT NULL,
  inputs jsonb,
  outputs jsonb,
  error_code varchar(120),
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX node_executions_execution_idx ON node_executions(workspace_id, execution_id, created_at);
CREATE UNIQUE INDEX node_executions_attempt_idx ON node_executions(execution_id, node_key, attempt);

CREATE TABLE assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  execution_id uuid REFERENCES workflow_executions(id) ON DELETE SET NULL,
  node_execution_id uuid REFERENCES node_executions(id) ON DELETE SET NULL,
  type asset_type NOT NULL,
  mime_type varchar(160) NOT NULL,
  storage_key text NOT NULL UNIQUE,
  original_name varchar(500),
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  checksum_sha256 char(64) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assets_workspace_created_idx ON assets(workspace_id, created_at DESC);
CREATE INDEX assets_execution_idx ON assets(workspace_id, execution_id);

CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  execution_id uuid NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  queue_job_id varchar(200),
  kind varchar(120) NOT NULL,
  status varchar(40) NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_execution_idx ON jobs(workspace_id, execution_id);

CREATE TABLE execution_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  execution_id uuid NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  node_execution_id uuid REFERENCES node_executions(id) ON DELETE SET NULL,
  level varchar(20) NOT NULL,
  event_type varchar(120) NOT NULL,
  message text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX execution_logs_execution_time_idx ON execution_logs(workspace_id, execution_id, created_at);

CREATE TABLE audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action varchar(160) NOT NULL,
  resource_type varchar(120) NOT NULL,
  resource_id uuid,
  request_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_workspace_time_idx ON audit_logs(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version varchar(120) PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
