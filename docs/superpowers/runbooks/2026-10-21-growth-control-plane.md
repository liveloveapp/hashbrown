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
- `tools/growth/.provision/` is gitignored. It holds `test-database.env` with
  `TEST_DATABASE_URL='...'` single-quoted, because the URL contains `&`.

## Run migrations

```
DATABASE_URL=... npx nx migrate-growth growth
```

Idempotent: applied migrations are recorded in the ledger table
`growth_schema_migrations`, and a second run applies nothing. A migration whose
checksum changed after it was applied aborts the run.

## Run the integration specs

```
set -a; . tools/growth/.provision/test-database.env; set +a
GROWTH_INTEGRATION=1 npx nx test-integration growth
```

`DATABASE_URL` and `B4_DATABASE_URL` must be unset. The specs clean up their rows.

## Switches and environment variables

| Variable | Meaning |
| --- | --- |
| `DATABASE_URL` | Postgres connection; set by the Vercel Neon integration on deployments |
| `GROWTH_DATABASE_ENVIRONMENT` | `production`, `preview` or `test`; which environment this database is |
| `DELIVERY_ENVIRONMENT` | Environment this deployment sends from |
| `GROWTH_EMAIL_HMAC_ACTIVE_SECRET` / `_ACTIVE_VERSION` / `_PREVIOUS_KEYS` | Keyring for email hashes; previous keys are a JSON array of `{version, secret}` |
| `GROWTH_ACTION_TOKEN_ACTIVE_SECRET` / `_ACTIVE_VERSION` / `_PREVIOUS_KEYS` | Keyring for signed action tokens, same shape |
| `GROWTH_PUBLIC_ACTION_ORIGIN` | Bare https origin for action links |
| `RESEND_API_KEY` | Resend sending key |
| `RESEND_WEBHOOK_SECRET` | Webhook signing secret |
| `RESEND_TRACKING_DISABLED` | Must be `true` |
| `RESEND_SENDER_VERIFIED` | Sending domain verified |
| `RESEND_NON_PRODUCTION_ALLOWLIST` | Recipients permitted outside production |
| `RESEND_NON_PRODUCTION_REDIRECT_TO` | Redirect target for non-production mail |
| `TEST_DATABASE_URL`, `GROWTH_INTEGRATION` | Integration specs only |

The sender refuses to send unless `DELIVERY_ENVIRONMENT === GROWTH_DATABASE_ENVIRONMENT`
and `RESEND_TRACKING_DISABLED=true`. Webhooks whose `environment` tag differs
from `GROWTH_DATABASE_ENVIRONMENT` are acknowledged with 200 and ignored.

## Routes

- `/_/unsubscribe`: GET with a token shows a confirmation form (400 with a
  generic body if the token is invalid); POST with the token records the
  unsubscribe stop (200), 400 on an invalid token, 503 on a retryable failure.
  Legacy email-based requests are still handled.
- `/_/growth/stop`: founder stop. GET with a token shows a confirmation form;
  POST records the contact stop (200) or returns a generic 400.
- `/_/webhooks/resend`: Svix-verified Resend events update delivery status by
  precedence and apply bounce and complaint stops; events tagged for another
  environment get 200 and are ignored.

## Not in PR 1

From section 14 of the design: observation intake and budgets (PR 2),
collectors (PR 3), website analytics (PR 4), the lifecycle service with
scoring, campaign calendar and templates, reply binding and the digest (PR 5),
the Get unstuck form (PR 6), and enabling production switches (PR 7).
