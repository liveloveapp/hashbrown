# Growth control plane runbook

The control plane is `@hashbrownai-internal/growth` (`tools/growth`, Nx project
`growth`): the Postgres schema and migrations, contacts, activity, a jobs queue,
idempotent stops, HMAC-keyed email hashes and action tokens, the Resend sender
and webhook processing, and the three routes under `www/src/app/%5F/`. Design:
`docs/superpowers/specs/2026-10-20-growth-lifecycle-design.md` sections 7, 8.1,
8.6 and 11.

## Get a connection string

Never commit it or print it into logs or PR text.

- Preview store: `vercel link --project hashbrown-www`, then
  `vercel env pull --environment=preview <private file>` and read `DATABASE_URL`.
- Or the Vercel API single-env endpoint for the project's `DATABASE_URL` with
  `decrypt=true`.
- `tools/growth/.provision/` is gitignored. Provisioning writes
  `test-database.env` there (mode 0600) with `TEST_DATABASE_URL='...'`
  single-quoted, because the URL contains `&`.

`TEST_DATABASE_URL` points at the dedicated test store
`growth-test-target-01`, which nothing but the integration specs uses. Only
migrations already on `main` may be applied to the preview store, which preview
deployments share: a migration recorded in the ledger from a branch makes
`migrate-growth` abort with a checksum mismatch after any later edit. A run
that crashes can leave fixture contacts keyed with email HMAC key version 1
behind in the test store.

Nx loads the repo-root `.env` into every target, so a `DATABASE_URL` there
silently becomes the migration target. Check it before running anything below.

## Run migrations

```
DATABASE_URL=... npx nx migrate-growth growth
```

Idempotent: applied migrations are recorded in the ledger table
`growth_schema_migrations`, and a second run applies nothing. A migration whose
checksum changed after it was applied aborts the run.

The preflight requires Node 24 or newer and refuses to run when
`TEST_DATABASE_URL` is set in the same shell (or `B4_DATABASE_URL`). Against the
preview store, apply only migrations that are already on `main`.

## Run the integration specs

```
set -a; . tools/growth/.provision/test-database.env; set +a
GROWTH_INTEGRATION=1 npx nx test-integration growth
```

`DATABASE_URL` and `B4_DATABASE_URL` must be unset, including in the repo-root
`.env`, and Node must be 24 or newer. The specs clean up their rows, and they
run against the dedicated test store, so a branch with an unmerged migration is
safe to test; after a crashed run look for leftover key-version-1 fixture
contacts.

## Switches and environment variables

| Variable                                                                   | Meaning                                                                         |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                             | Postgres connection; set by the Vercel Neon integration on deployments          |
| `GROWTH_DATABASE_ENVIRONMENT`                                              | `production`, `preview` or `test`; which environment this database is           |
| `DELIVERY_ENVIRONMENT`                                                     | `production`, `preview` or `test`; the environment this deployment sends from   |
| `GROWTH_EMAIL_HMAC_ACTIVE_SECRET` / `_ACTIVE_VERSION` / `_PREVIOUS_KEYS`   | Keyring for email hashes; previous keys are a JSON array of `{version, secret}` |
| `GROWTH_ACTION_TOKEN_ACTIVE_SECRET` / `_ACTIVE_VERSION` / `_PREVIOUS_KEYS` | Keyring for signed action tokens, same shape                                    |
| `GROWTH_PUBLIC_ACTION_ORIGIN`                                              | Bare https origin for action links                                              |
| `RESEND_API_KEY`                                                           | Resend sending key                                                              |
| `RESEND_WEBHOOK_SECRET`                                                    | Webhook signing secret                                                          |
| `RESEND_TRACKING_DISABLED`                                                 | Must be `true`                                                                  |
| `RESEND_SENDER_VERIFIED`                                                   | Sending domain verified                                                         |
| `RESEND_NON_PRODUCTION_ALLOWLIST`                                          | Recipients permitted outside production                                         |
| `RESEND_NON_PRODUCTION_REDIRECT_TO`                                        | Redirect target for non-production mail                                         |
| `TEST_DATABASE_URL`, `GROWTH_INTEGRATION`                                  | Integration specs only; `TEST_DATABASE_URL` is the dedicated test store         |

The sender refuses to send unless `DELIVERY_ENVIRONMENT === GROWTH_DATABASE_ENVIRONMENT`
and `RESEND_TRACKING_DISABLED=true`. These refusals are enforced on the delivery
policy object the caller builds from these variables; that caller is the
lifecycle service in PR 5. Webhooks whose `environment` tag differs
from `GROWTH_DATABASE_ENVIRONMENT` are acknowledged with 200 and ignored.

## Routes

- `/_/unsubscribe`: GET with a token shows a confirmation form (400 with a
  generic body if the token is invalid); POST with the token records the
  unsubscribe stop (200), 400 on an invalid token, 503 on a retryable failure.
  A GET without a token gets 400.
- `/_/growth/stop`: founder stop. GET with a token shows a confirmation form;
  POST records the contact stop (200), returns a generic 400 on an invalid
  token, or 503 with `Retry-After: 30` on a database fault.
- `/_/webhooks/resend`: Svix-verified Resend events update delivery status by
  precedence and apply bounce and complaint stops; events tagged for another
  environment get 200 and are ignored.

  The Resend account is shared with threadplane, so both products' webhook
  events reach both products' endpoints. Events whose sender address is not on
  `hashbrown.dev` are acknowledged with 200 (`foreign_sender`) and ignored
  before any database access.

## Not in PR 1

The lifecycle service is covered by `2026-10-21-growth-lifecycle-service.md`.
Still to come from section 14 of the design: the Get unstuck form (PR 6) and
enabling production switches (PR 7).
