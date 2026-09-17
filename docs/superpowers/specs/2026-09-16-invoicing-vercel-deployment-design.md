# Invoicing Example on Vercel — Design

## Summary

The invoicing example (React + Hashbrown + B4 approvals) becomes the second
Vercel deployment target, served at `https://invoicing.hashbrown.dev`. It
moves from `samples/invoicing` to a new `examples/invoicing` tree, keeps its
application code as application code, and is deployed by the pipeline built
in [2026-09-15-vercel-deployment-design.md](./2026-09-15-vercel-deployment-design.md).

B4's native `vercel` build target emits the agent function. A hashbrown tool
assembles that function, the React static build, and one small `/api`
function into a single Vercel Build Output tree. Durable state lives in one
Neon Postgres: B4's own checkpoints, threads, and permissions through its
generated per-request stores, and the example's session/review state through
a repository boundary with in-memory and Postgres implementations.

Capability gaps in B4 discovered while doing this are recorded as candidate
upstream changes (`~/repos/dawn`), not worked around inside the example.

## Goals

- `examples/invoicing` is deployable by `npx nx build invoicing` producing
  `examples/invoicing/.vercel/output`, and `deploy.yml` deploys it exactly as
  it deploys `www`.
- The approval flow (propose → interrupt → approve → apply exactly once) is
  correct when consecutive requests land on different function instances.
- Local development, unit tests, and the deterministic browser e2e keep
  working without a database.
- The example contains only application code: agent routes, middleware,
  domain logic, HTTP reads, persistence adapters. Assembly and provisioning
  live in `tools/vercel`.

## Non-Goals

- Abuse protection or run caps for the public demo (decided: none for now).
- Session or thread expiry/cleanup (revisit once usage is visible).
- Separate databases for preview deployments (previews share production's
  Neon database; sessions and threads are UUID-keyed).
- Migrating the finance, fast-food, and smart-home samples; `samples/`
  remains as-is apart from the invoicing move.
- Changing B4 in this repository. Gaps are listed for upstream PRs.

## Layout

```
examples/invoicing/
  project.json            # Nx app `invoicing`: build → assembled .vercel/output
  vercel.assembly.json    # declarative input to tools/vercel/assemble.mjs
  react/                  # unchanged Vite app (Nx `invoicing-react`)
  server/                 # B4 app root (Nx `invoicing-server`)
    b4.config.ts          # build.targets: ["vercel"]
    src/app/**            # agent routes and tools (unchanged)
    src/middleware.ts     # B4 file-convention middleware (new)
    src/api.ts            # /api/* Node handler entry (new; today's http.ts)
    src/persistence/      # repositories: memory + postgres (new)
    src/main.ts           # local dev server (memory or Postgres by env)
    browser-fixture.ts    # e2e fixture (memory repositories)
  shared/                 # @invoicing/contracts (Nx `invoicing-contracts`)
  e2e/                    # Playwright (Nx `invoicing-e2e`)
```

`git mv samples/invoicing examples/invoicing`; every path reference follows
(`tsconfig.base.json` alias, root `package.json` workspaces, project.json
files, vite/vitest/playwright configs, README, `design/react/…`). Nx project
names are unchanged.

## B4 application

`examples/invoicing/server` becomes a real B4 app root instead of the
temporary copy that `runtime.ts` fabricates today:

- `b4.config.ts`: `config({ build: { targets: ['vercel'] } })`. No CORS
  (same origin). No sandbox, workspace, memory, or custom stores, so the
  target's capability gate passes.
- `src/middleware.ts` (default export via `defineMiddleware`) replaces the
  programmatic `middleware:` option. It dispatches on `routeId` to the
  existing assistant and review middleware factories and the thread-ownership
  guard, all constructed once at module scope over a repository chosen by
  environment (see Persistence). The `allow(context)` payload keeps the same
  closures (`readLedger`, `readPayment`, `prepareAllocation`,
  `applyAllocation`) so route tools are unchanged.
- `b4 build --cwd examples/invoicing/server` emits
  `examples/invoicing/server/.vercel/output/functions/index.func` (bundled
  runtime, `nodejs24.x`, Fluid) and `config.json`; the root `vercel.json` it
  reconciles (`buildCommand`, `fluid: true`) is committed so builds are
  stable. B4's generated stores read `DATABASE_URL` and create the default
  `public.b4_*` tables on first use.
- `runtime.ts` is deleted. Local dev (`nx serve invoicing-server`) runs
  `createRuntimeRequestListener({ appRoot: <server dir>, middleware })` with
  the middleware imported from `src/middleware.ts` and the Node request
  listener from `src/api.ts`, exactly as today but without the temp workspace.
  Alternatively `b4 dev` for the agent surface alone.

## Persistence

Today's `session-store.ts`, `review-coordinator.ts`, `thread-ownership.ts`,
and `assistant-middleware.ts` hold authoritative state in process-local
`Map`s and rely on synchronous critical sections. The logic stays; the
storage moves behind two repository interfaces:

```ts
interface Document<T> {
  readonly version: number;
  readonly value: T;
}

interface SessionRepository {
  create(initial: Session): Promise<string>; // returns id
  load(id: string): Promise<Document<Session> | undefined>;
  /** Compare-and-swap; rejects with 'conflict' when version moved. */
  commit(id: string, expectedVersion: number, next: Session): Promise<void>;
}

interface ThreadRepository {
  // bindings + tokens
  load(threadId: string): Promise<Document<ThreadRecord> | undefined>;
  commit(
    threadId: string,
    expectedVersion: number | null,
    next: ThreadRecord,
  ): Promise<void>;
}
```

- `Session` is today's `{ generation, ledger, proposals, operations }` with
  `Map`s replaced by plain records so it serialises as one JSONB document.
- `ThreadRecord` merges the coordinator's `Binding`, its per-decision tokens,
  and the ownership/assistant `owners` entries for that thread:
  `{ sessionId, routeId, generation, selectedPaymentId, selectedInvoiceId?,
proposalId?, tokens: { initial?, once?, cancelled? } }`. Capability
  contexts are rebuilt from the record, so the `capabilities` map disappears.
- Mutations become `load → pure function → commit(expectedVersion)`, retried
  once on `conflict`. `decide()` keeps its exact-once semantics because the
  operation record is written in the same CAS commit as the ledger change.
- Implementations: `createMemoryRepositories()` (unit tests, e2e fixture,
  local default) and `createPostgresRepositories(pool)` using `pg` with two
  tables:

  ```sql
  CREATE TABLE IF NOT EXISTS invoicing_sessions (
    id uuid PRIMARY KEY, version integer NOT NULL, value jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE IF NOT EXISTS invoicing_threads (
    thread_id text PRIMARY KEY, version integer NOT NULL, value jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now());
  ```

  `commit` is `UPDATE … SET value=$3, version=version+1 WHERE id=$1 AND version=$2`
  and treats zero affected rows as `conflict`. The schema is ensured once per
  process with `CREATE TABLE IF NOT EXISTS` (idempotent, no migration tool).

- Selection: `DATABASE_URL` present → Postgres (one `pg.Pool` at module
  scope, `max: 2`, reused across invocations under Fluid compute); absent →
  memory. Both the B4 middleware and the `/api` function use the same module.
- The session cookie gains `Secure` when the request is HTTPS. Everything
  else about sessions (UUID cookie, `Path=/; HttpOnly; SameSite=Lax`) stays.

## Assembly: `tools/vercel/assemble.mjs`

A dependency-free tool (esbuild is already a workspace dependency) that turns
a declarative manifest into a Vercel Build Output tree. It is generic: no
invoicing knowledge.

`examples/invoicing/vercel.assembly.json`:

```json
{
  "output": ".vercel/output",
  "static": {
    "dir": "../../dist/examples/invoicing/react",
    "spaFallback": "index.html"
  },
  "functions": {
    "index": { "from": "server/.vercel/output/functions/index.func" },
    "api": {
      "entry": "server/src/api.ts",
      "runtime": "nodejs24.x",
      "maxDuration": 30
    }
  },
  "routes": [
    { "src": "/api/(.*)", "dest": "/api" },
    { "src": "/(agui|threads)(/.*)?", "dest": "/index" },
    { "src": "/healthz", "dest": "/index" }
  ]
}
```

Behaviour: copy `static` to `output/static`; copy prebuilt functions verbatim
(preserving B4's `.vc-config.json`); bundle `entry` functions with esbuild
(`platform: node`, `target: node24`, ESM, external none) and write their
`.vc-config.json` (`launcherType: Nodejs`, `supportsResponseStreaming: true`);
write `config.json` as `version: 3` with `[ { handle: "filesystem" }, …routes,
{ src: "/(.*)", dest: "/<spaFallback>" } ]`. Paths resolve relative to the
manifest. The tool replaces `output` atomically.

`examples/invoicing/project.json` (Nx app `invoicing`):

```json
{
  "name": "invoicing",
  "implicitDependencies": [
    "invoicing-react",
    "invoicing-server",
    "invoicing-contracts"
  ],
  "targets": {
    "build": {
      "executor": "nx:run-commands",
      "outputs": ["{projectRoot}/.vercel/output"],
      "options": {
        "commands": [
          "npx nx build invoicing-react",
          "npx b4 build --cwd examples/invoicing/server",
          "node tools/vercel/assemble.mjs examples/invoicing/vercel.assembly.json"
        ],
        "parallel": false
      }
    }
  }
}
```

`b4 build` runs from the server workspace so its private `@b4run/*`
dependencies resolve; the Vercel target bundles them into the function.

## Pipeline and provisioning

- `pr-main.yml` `DEPLOY_TARGETS` gains
  `{ "key": "invoicing", "dir": "examples/invoicing", "project_id_secret": "VERCEL_PROJECT_ID_INVOICING" }`.
  `deploy.yml` needs no change: it runs `nx build invoicing` and
  `vercel deploy --prebuilt --cwd examples/invoicing`.
- `tools/vercel/bootstrap.mjs` `TARGETS` gains
  `{ key: 'invoicing', project: 'hashbrown-invoicing', secret: 'VERCEL_PROJECT_ID_INVOICING', domains: ['invoicing.hashbrown.dev'], requiredEnv: ['OPENAI_API_KEY', 'DATABASE_URL'] }`.
  The per-target loop generalises: domains from the entry (Vercel DNS serves
  the subdomain automatically because the zone is on the same account), env
  upsert for `OPENAI_API_KEY`, and a **check** that every `requiredEnv` key is
  present on production and preview, printing `env DATABASE_URL  missing —
connect a Neon store to hashbrown-invoicing in the Vercel dashboard
(Storage → Neon)` when it is not. Marketplace stores cannot be created
  through the API, so that connection is the one manual step; it injects
  `DATABASE_URL` into both environments.
- `OPENAI_MODEL` is not set; the routes pin `gpt-5-mini` in code.

## Local development and tests

- `nx serve invoicing-server` + `nx serve invoicing-react` unchanged in use;
  the server uses memory repositories unless `DATABASE_URL` is exported.
- Unit tests: repository contract tests run against memory always and
  against Postgres when `TEST_DATABASE_URL` is set (CI secret pointing at a
  Neon branch; skipped otherwise). Coordinator/session tests are rewritten to
  the async API with the same scenarios.
- `tools/vercel/assemble.test.mjs`: fixture directories in, asserts the
  output tree, `config.json` route order, and that prebuilt `.vc-config.json`
  files are preserved.
- Artifact e2e (`invoicing:e2e`, mirrors `www`): after `nx build invoicing`,
  boots `api.func`'s handler on `127.0.0.1` and asserts `GET /api/snapshot`
  sets the session cookie and returns the seeded ledger; asserts
  `index.func/.vc-config.json` is `nodejs24.x` and `static/index.html` exists.
- Browser e2e (`example-e2e`) keeps the scripted fixture on memory
  repositories; only its import paths change.
- Preview verification (manual, once): `/api/snapshot` → run the assistant →
  start a review → approve → confirm the ledger changed, with the approve
  request deliberately sent after the function scaled to zero (wait > 30 s)
  to prove cross-instance resume.

## B4 gaps to take upstream (`~/repos/dawn`)

Recorded, not solved here. Each is a candidate PR with the invoicing example
as its motivating case:

1. **Vercel target emits only the runtime function.** A real app needs static
   assets and its own HTTP endpoints beside `/agui` and `/threads`. Proposal:
   `build.vercel: { static?: { dir, spaFallback? }, functions?: {…}, routes?: […] }`
   so `b4 build` alone produces the deployable tree; `assemble.mjs` becomes
   unnecessary.
2. **No `--out-dir`/output override**; the target always publishes to
   `<appRoot>/.vercel/output`, and `validateVercelOutput` rejects any
   `config.json` other than the exact catch-all. Composition today must
   post-process the published tree.
3. **`vercel.json` reconciliation assumes Vercel Git builds.** A prebuilt CI
   flow neither needs nor wants a `buildCommand`; an opt-out (or a
   `--prebuilt` mode) would avoid committing a file that is only there to
   satisfy the reconciler.
4. **Generated Postgres stores have no per-environment namespace** (`schema`
   / `tablePrefix`), so preview and production deployments share
   `public.b4_*` unless the stores are hand-composed.
5. **Middleware lifecycle.** The file-convention middleware has no init/dispose
   hooks; a pool opened at module scope is the only option, and there is no
   documented way to release it on function shutdown.
6. **Docs:** the package ships no `deployment/vercel.md`; the Vercel target is
   discoverable only from source and the `hono` guide's asides.

Found while implementing (2026-09-16):

7. **Silent `0 routes discovered`** when the app's `package.json` lacks
   `"type": "module"`: the tsx loader yields CommonJS interop for the route
   modules, `inferRouteKind` returns `null`, and `b4 check` reports success
   with zero routes instead of diagnosing the module-type mismatch. This is
   the most likely first-run failure for a new app root.
8. **`build.targets` is typed `readonly string[]`**, so a typo such as
   `'vercell'` type-checks and fails only at build time.
9. **The Vercel function is named `index`.** In the Build Output API a
   function named `index` is also served at `/`, so it shadows a static
   `index.html`; any app that ships a frontend beside the runtime has to
   rename the function (the assembler copies it as `agent.func`). A different
   default name, or a name option, would avoid this.
10. **`/healthz` initialises the request stores**, so on the Vercel target the
    liveness probe fails when the database is unreachable or `DATABASE_URL`
    is unset — it behaves as a readiness probe.
11. **Store failures are opaque:** an unreachable database surfaces as
    `B4.run runtime failure — [object ErrorEvent]` and a generic 500, with
    the underlying WebSocket/Postgres error not logged.
12. **Local execution of the built Vercel bundle needs a WebSocket proxy**
    (`@neondatabase/serverless` cannot talk to a plain local Postgres; the
    `B4_PG_WS_PROXY` value must be `host:port` without a scheme). A pooled
    `pg` fallback for the `vercel` target — or documenting the proxy — would
    make the artifact testable offline.

## Rollout

1. Land the move to `examples/invoicing` and the persistence boundary with
   memory repositories (no behaviour change; all existing tests green).
2. Land the B4 app-root changes (`b4.config.ts`, `src/middleware.ts`,
   `src/api.ts`), the Postgres repositories, `assemble.mjs`, and the
   `invoicing` Nx app; `nx build invoicing` produces a valid tree locally.
3. Bootstrap: create `hashbrown-invoicing`, attach `invoicing.hashbrown.dev`,
   set `OPENAI_API_KEY`; connect Neon in the dashboard; re-run bootstrap to
   confirm `DATABASE_URL`.
4. Add the target to `DEPLOY_TARGETS`; open the PR; verify the preview
   including the cross-instance approval; merge; production deploys.
5. File the upstream B4 issues/PRs from the gaps list.
