# API contract

Base URL: `/api`. Authentication uses `Authorization: Bearer <token>` except for health and auth.

## Response envelope

```json
{ "data": {}, "meta": { "requestId": "uuid" } }
```

```json
{
  "error": {
    "code": "WORKFLOW_VALIDATION_FAILED",
    "message": "The workflow contains invalid connections.",
    "details": [],
    "requestId": "uuid"
  }
}
```

## Routes

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/health` | liveness and dependency-neutral version check |
| POST | `/auth/register` | create user and default workspace |
| POST | `/auth/login` | issue a bounded JWT |
| GET/POST | `/projects` | list/create projects |
| GET/PATCH/DELETE | `/projects/:projectId` | project detail/mutation |
| GET/POST | `/projects/:projectId/workflows` | list/create workflows |
| GET/PATCH/DELETE | `/workflows/:workflowId` | latest graph/detail/mutation |
| POST | `/workflows/:workflowId/versions` | save immutable graph version |
| GET | `/workflows/:workflowId/versions` | version history |
| POST | `/workflows/:workflowId/validate` | deterministic graph validation |
| POST | `/workflows/:workflowId/executions` | snapshot and enqueue execution |
| GET | `/executions/:executionId` | execution plus node state |
| POST | `/executions/:executionId/cancel` | request cooperative cancellation |
| POST | `/executions/:executionId/retry` | enqueue failed execution retry |
| GET | `/executions/:executionId/logs` | structured execution logs |
| GET | `/executions/:executionId/events` | SSE progress stream |
| GET | `/providers` | enabled providers and capabilities |
| GET | `/providers/:providerId/models` | server-derived models |
| POST | `/providers/:providerId/test` | connection/capability probe |
| GET | `/assets` | workspace-scoped asset list |
| GET | `/assets/:assetId` | asset metadata |
| GET | `/assets/:assetId/content` | authorized content redirect/stream |
| GET | `/templates` | server-defined starter workflows |

Execution creation returns `202 Accepted`:

```json
{
  "data": {
    "executionId": "uuid",
    "workflowVersionId": "uuid",
    "status": "QUEUED"
  }
}
```

SSE event names are `execution.started`, `node.queued`, `node.started`, `node.progress`,
`node.completed`, `node.failed`, `execution.completed`, `execution.failed`, and
`execution.cancelled`. Each event carries an opaque event ID so a future outbox can support
resume via `Last-Event-ID`.
