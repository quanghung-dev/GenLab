# GenFlow

GenFlow is a modular visual AI workflow platform: a production-oriented foundation for
building provider-independent text, image, video, and automation pipelines.

The repository implements a real vertical-slice MVP rather than a static editor mockup:

- a graph model that is independent of React Flow;
- immutable workflow versions and version-bound executions;
- strict port and DAG validation;
- a provider registry with mock and ComfyUI adapters;
- PostgreSQL as the source of truth, BullMQ workers for long-running jobs, and Redis SSE
  events;
- S3-compatible or local asset storage;
- a Next.js visual editor with node library, inspector, save, validate, run, logs, and assets;
- unit tests for graph planning, execution, and provider registration.

## Quick start

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm db:migrate
pnpm dev
```

Open `http://localhost:3000`. The API listens on `http://localhost:4000`.

Mock mode is enabled by default. It exercises the same provider interfaces as real adapters
without paid credentials. Set `COMFYUI_BASE_URL` and disable mock mode to register a ComfyUI
instance.

## Quality gates

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

See [docs/architecture.md](docs/architecture.md) for system boundaries and
[docs/api.md](docs/api.md) for the HTTP/SSE contract.
