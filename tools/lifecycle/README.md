# Lifecycle service

`tools/lifecycle` is Hashbrown's growth lifecycle service: a b4run 0.14 app
whose `dispatch` workflow runs one tick of the job dispatcher (Resend
message-id reconciliation, observation projection, hello activations,
enrollment, digest, then leased jobs). It is deployed prebuilt to the Vercel
project `hashbrown-lifecycle` and is only ever called by `hashbrown-www`
(the cron and form nudges) with the shared service bearer.

## Commands

```sh
npx nx build lifecycle            # type-check, b4 build --clean, wrap + verify the adapter
npx nx test lifecycle
npx nx lint lifecycle
npx nx check lifecycle            # b4 check plus type-checks
GROWTH_INTEGRATION=1 npx nx test-integration lifecycle   # needs TEST_DATABASE_URL
```

## Build output

`b4 build --clean` writes `.vercel/output`:

```
.vercel/output/
  config.json                    # routes /(.*) to /b4
  functions/b4.func/
    .vc-config.json              # rewritten: handler lifecycle.mjs, maxDuration 60
    index.mjs                    # generated b4run function (a Hono app), never edited
    lifecycle.mjs                # the adapter, bundled by scripts/verify-vercel-adapter.mts
```

`scripts/verify-vercel-adapter.mts` asserts the generated shape, bundles
`src/vercel-adapter.ts` beside `index.mjs` (it may import only `./index.mjs`
and `node:crypto`), points `.vc-config.json` at it, and then imports the
function from an isolated temp directory under plain Node with only `PATH`,
`LIFECYCLE_SERVICE_SECRET` and `VERCEL_DEPLOYMENT_ID` set. The check fails the
build unless every path (`/healthz`, `/readyz`, `/threads`,
`/threads/x/state`, `/memory/candidates`, `/dispatch`) answers 401 without the
bearer, answers 503 with the bearer and no `B4_DATABASE_URL`, and b4run then
reaches only the state database while `process.env` stays unchanged.

CI deploys it through the generic path in `.github/workflows/deploy.yml`:
`npx nx build lifecycle --configuration=production`, then
`vercel deploy --prebuilt --cwd tools/lifecycle`. The target is optional and
is skipped while `VERCEL_PROJECT_ID_LIFECYCLE` is unset.

## The adapter

`src/vercel-adapter.ts` sits in front of b4run because b4run's own
`/healthz`, `/readyz` and thread endpoints are open by default:

1. no `LIFECYCLE_SERVICE_SECRET`: 503 `{ "error": "service_secret_missing" }`
2. anything but `Authorization: Bearer <secret>`: 401 on every path
3. no `B4_DATABASE_URL`: 503 `{ "error": "state_database_missing" }`
4. otherwise the same `Request` reaches b4run with
   `{ DATABASE_URL: B4_DATABASE_URL, B4_PG_SCHEMA?, B4_PG_TABLE_PREFIX? }` as
   its env

Every adapter response carries `cache-control: no-store`; authenticated
`/healthz` also carries `x-hashbrown-deployment-id`. `src/middleware.ts`
checks the same bearer inside b4run, so execution endpoints are gated twice.

## Two databases

`DATABASE_URL` is the growth store, read by every growth query through
`process.env`. `B4_DATABASE_URL` is b4run's state store. b4run 0.14 resolves
its store settings as `env[name] ?? process.env[name]`, so passing the state
URL as the per-request `DATABASE_URL` binds b4run to it without changing
`process.env`. b4run seeds its runtime env once, from the first request's env,
into a module-local copy; it never writes `process.env`. Neither URL falls
back to the other.

## Environment

The Vercel bootstrap (`tools/vercel/bootstrap.mjs`) sets the lifecycle keys
from `tools/growth/.provision/growth.env`; the Neon integration injects
`DATABASE_URL` and `B4_DATABASE_URL`. `CAMPAIGN_ENROLLMENT_START_AT` stays
unset until enrollment is enabled and is immutable once recorded. See
`.env.example` for the full list.
