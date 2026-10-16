# DataForge AI

A governed data-pipeline workspace with source profiling, human approvals, quality summaries, and audit trails.

## Run & Operate

- `pnpm install --frozen-lockfile` — install the workspace dependencies
- Start `artifacts/dataforge-ai: web` in Replit Workflows — frontend at `/`
- Start `artifacts/api-server: API Server` in Replit Workflows — API at `/api` (port 8080)
- The managed frontend workflow supplies `PORT` and `BASE_PATH`; use it rather than running Vite without those variables.
- `artifacts/mockup-sandbox: Component Preview Server` is the existing optional design-preview service at `/__mockup`.
- `pnpm --filter @workspace/api-server run dev` — build and start the API (requires the workflow-provided `PORT`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — provided by the project's PostgreSQL database; do not commit credentials.
- On a fresh development database, run `pnpm --filter @workspace/db run push` before starting the API. This updates the schema; inspect any proposed changes before applying to an existing database.
- The API seeds a demo customer pipeline only when the pipelines table is empty.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/dataforge-ai/` — React/Vite frontend and styles
- `artifacts/api-server/` — Express API and startup
- `lib/db/src/schema/` — PostgreSQL schema
- `lib/api-spec/` — OpenAPI contract and code generation
- `lib/api-client-react/`, `lib/api-zod/` — generated shared clients and validation
- `artifacts/mockup-sandbox/` — existing design previews

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The API requires the database schema before startup because demo seeding runs before it listens.
- The imported execution route calculates validation results from source-profile metadata; this setup does not add a real data-transformation engine or an external AI provider.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
