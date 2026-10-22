# Growth lifecycle service runbook

The lifecycle service sends the founder email sequence and the founder
notifications, and projects observation evidence on a schedule. It lives in
`tools/lifecycle` and is deployed as the Vercel project `hashbrown-lifecycle`.
Only `hashbrown-www` calls it: the cron at `/_/cron/lifecycle` and, from PR 6,
form nudges. See the control plane runbook (`2026-10-21-growth-control-plane.md`)
for connection strings and migrations, and the observation intake runbook
(`2026-10-21-growth-observation-intake.md`) for what projection does.

## What it is and is not

- It is a b4run app (formerly Dawn). It hosts one route, `/dispatch#workflow`,
  and one run is one tick of the job dispatcher.
- No model is called. The workflow is plain code.
- b4run has no cron. www's `/_/cron/lifecycle` route calls the service with
  the shared bearer. This PR ships no schedule for it; see "Scheduling the
  tick".
- It adds no PostHog events and sends nothing about a contact to PostHog.

## Two databases

| Variable          | Store                                    | Read by                                                         |
| ----------------- | ---------------------------------------- | --------------------------------------------------------------- |
| `DATABASE_URL`    | Growth (contacts, jobs, activity)        | Every growth query, through `process.env`                       |
| `B4_DATABASE_URL` | b4run state (threads, checkpoints, etc.) | The outer adapter, which binds b4run's stores to it per request |

Neither falls back to the other. The outer adapter
(`tools/lifecycle/src/vercel-adapter.ts`) calls b4run with
`{ DATABASE_URL: <B4_DATABASE_URL>, B4_PG_SCHEMA?, B4_PG_TABLE_PREFIX? }` as the
fetch env, so b4run's stores open the state database while the process
`DATABASE_URL` stays the growth database. `nx build lifecycle` runs
`scripts/verify-vercel-adapter.mts`, which proves both on the built artifact.

The adapter answers 503 `service_secret_missing` without
`LIFECYCLE_SERVICE_SECRET`, 401 on every path (`/healthz`, `/readyz`,
`/threads*`, `/memory/*`, `/dispatch`) without the exact bearer, and 503
`state_database_missing` with a bearer but no `B4_DATABASE_URL`. b4run's own
middleware checks the bearer again, so execution endpoints are gated twice.

## Switches and environment

Every switch accepts only the exact strings `true` and `false`. Unset is
`false`. Any other value throws when the tick loads its configuration, so the
tick fails and nothing is sent.

| Variable                                | Where     | Meaning                                                                                                                          |
| --------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `LIFECYCLE_SERVICE_SECRET`              | both      | Shared bearer between www and the service                                                                                        |
| `LIFECYCLE_URL`                         | www       | HTTPS origin of the lifecycle deployment                                                                                         |
| `LIFECYCLE_CRON_ENABLED`                | www       | The cron and `nudgeLifecycle` call the service only when exactly `true`                                                          |
| `CRON_SECRET`                           | www       | The bearer the scheduler sends to `/_/cron/lifecycle`                                                                            |
| `GOOGLE_REPLY_HMAC_SECRET`              | www       | Signs mailbox reply events; the reply route answers 503 when unset                                                               |
| `DATABASE_URL`                          | both      | Growth store (Neon integration)                                                                                                  |
| `B4_DATABASE_URL`                       | lifecycle | b4run state store (Neon integration)                                                                                             |
| `B4_PG_SCHEMA`, `B4_PG_TABLE_PREFIX`    | lifecycle | Optional b4run table placement                                                                                                   |
| `GROWTH_DATABASE_ENVIRONMENT`           | both      | `production`, `preview` or `test`; must equal `DELIVERY_ENVIRONMENT` or the delivery policy throws                               |
| `DELIVERY_ENVIRONMENT`                  | lifecycle | `production`, `preview` or `test`                                                                                                |
| `GROWTH_PUBLIC_ACTION_ORIGIN`           | lifecycle | Origin of the signed links in mail                                                                                               |
| `GROWTH_ACTION_TOKEN_ACTIVE_*`          | both      | Signed link keys                                                                                                                 |
| `GROWTH_EMAIL_HMAC_ACTIVE_*`            | both      | Email digest keys                                                                                                                |
| `RESEND_API_KEY`                        | lifecycle | Sending key; the sender is a fetch-based Resend client, so the `resend` SDK is not in the bundle                                 |
| `RESEND_TRACKING_DISABLED`              | lifecycle | Must be `true` or the delivery policy throws                                                                                     |
| `RESEND_SENDER_VERIFIED`                | lifecycle | `true` once `hashbrown.dev` is verified in Resend                                                                                |
| `RESEND_NON_PRODUCTION_ALLOWLIST`       | lifecycle | Outside production, the only recipients allowed (comma list)                                                                     |
| `RESEND_NON_PRODUCTION_REDIRECT_TO`     | lifecycle | Optional; must be on the allowlist; receives all non-production mail                                                             |
| `FOUNDER_NOTIFICATION_EMAIL`            | lifecycle | Receives founder notifications and the install digest                                                                            |
| `DELIVERY_ENABLED`                      | lifecycle | Off: internal notifications wait and `send_step` defers with `delivery_disabled`                                                 |
| `CAMPAIGN_ENABLED`                      | lifecycle | Off: `send_step` jobs are not leased                                                                                             |
| `CAMPAIGN_ENROLLMENT_ENABLED`           | lifecycle | Turns on enrollment materialization; needs `CAMPAIGN_ENROLLMENT_START_AT`                                                        |
| `CAMPAIGN_ENROLLMENT_START_AT`          | lifecycle | Canonical `YYYY-MM-DDTHH:MM:SS.mmmZ`; required only when enrollment is on; immutable once recorded (`campaign:v1:configuration`) |
| `GROWTH_OBSERVATION_PROCESSING_ENABLED` | lifecycle | Projects observations each tick                                                                                                  |
| `GROWTH_INSTALL_DIGEST_ENABLED`         | lifecycle | Enqueues the weekday install digest                                                                                              |
| `GROWTH_INSTALL_RUNTIME_HELLO_ENABLED`  | lifecycle | Approves contacts from install-runtime hello; runs only when `CAMPAIGN_ENROLLMENT_ENABLED` is also `true`                        |
| `LIFECYCLE_BATCH_SIZE`                  | lifecycle | Jobs leased per tick, an integer from 1 to 25; default 20                                                                        |

`tools/vercel/bootstrap.mjs` sets these from the provisioning output.
`DATABASE_URL` and `B4_DATABASE_URL` come from the Neon integration and the
bootstrap never writes them. Keep `CAMPAIGN_ENROLLMENT_START_AT` unset until
enrollment is enabled.

On www, a `LIFECYCLE_CRON_ENABLED` value other than exactly `true` or `false`
answers the cron 503 and logs `[lifecycle-cron-misconfigured]`. An unset or
`false` value answers 503 quietly. `nudgeLifecycle` (used by PR 6) honours the
same switch and does nothing unless it is exactly `true`.

## One tick

The cron calls `POST /threads/<uuid>/runs/wait` with
`{ "route": "/dispatch#workflow", "input": { "trigger": "cron" } }`. The
workflow reads the switches, then runs these steps in order:

1. Resend message-id reconciliation.
2. Observation projection, when enabled. A failure here raises the
   `observation_projection_failed` alert and does not block the rest.
3. Install-runtime hello activations, when both enrollment and hello are
   enabled.
4. Enrollment materialization, when enabled, then a score recompute for each
   newly enrolled contact.
5. Install digest enqueue, when enabled and the Pacific date is a weekday.
6. Lease up to `LIFECYCLE_BATCH_SIZE` due jobs (kinds `fulfill`, `notify`,
   `send_step`, `reply_reconcile`, `digest`) and dispatch them one at a time.

Each lease lasts 60 seconds and is renewed every 20 seconds. A job that can
never succeed is quarantined (`deterministic_job_poison`) and the loop
continues. Overlapping ticks never share a job, because leasing skips locked
and live-leased rows. `maxDuration` is 60 seconds. No job starts once 40
seconds of the tick have passed (`TICK_JOB_START_BUDGET_MS`): the rest are
released at once with `tick_budget_exhausted` and the next tick leases them.
The cron route waits up to 58 seconds for the tick and has `maxDuration` 60.

## Scheduling the tick

`www/vercel.json` schedules `GET /_/cron/lifecycle` every 30 minutes
(`*/30 * * * *`). Vercel sends `Authorization: Bearer $CRON_SECRET`, and the
route answers 503 until `LIFECYCLE_CRON_ENABLED` is `true`, so the schedule is
harmless while the switch is off.

A cron more often than daily needs a Vercel Pro team; a Hobby team rejects
every deploy whose cron runs more than once a day. `hashbrown-www` and
`hashbrown-lifecycle` are on the `blovedev` team, which moved to Pro on
2026-10-22. Two ticks fall inside the 07:00 Pacific send window each
weekday.

Before the switch is on, run a tick by hand: the `curl` against
`/threads/<uuid>/runs/wait` in "Run a tick by hand".

## Calendar and send window

All dates are `America/Los_Angeles`.

- Step 1 is due at 07:00 Pacific on the next weekday after enrollment, and
  never before `campaign.enrolled:v1` is five minutes old.
- Step 2 is due three business days after step 1 is accepted by Resend. Step 3
  is due eight business days after step 1, then five business days after step 2.
  A replay never moves a send earlier.
- A `send_step` sends only Monday to Friday during Pacific hour 7. The lease
  SQL, the submission authorization and the sender each check it, so a tick
  that starts at 06:59:58 or 07:59:59 obeys the window at the moment of the
  Resend call. There is no override.
- Weekends are skipped. Holidays are not.
- Throughput: at a 30-minute cadence two ticks fall inside the 07:00 hour, and
  the batch of 20 is shared with every job kind, so at most about 40
  `send_step`s go out per weekday. The overflow slips a business day.
- The install digest is enqueued once per Pacific weekday with the key
  `install_digest:<YYYY-MM-DD>` and is due at 07:00 Pacific
  (`nextPacificBusinessMorning`), not at the first tick after midnight.

## Approval paths

Only `growth_contacts.outreach_approved_at`, backed by a matching approval
activity, authorizes a `send_step`. A `fulfill` needs no approval. There are
three paths:

| Path                    | Activity kind                       | Detail                                                                                                    |
| ----------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Get unstuck form (PR 6) | `form.outreach_approved`            | `source_form = 'unstuck'`                                                                                 |
| Founder install digest  | `contact.reauthorized`              | `provenance = 'founder_action'`; the link is `/_/growth/approve-install`, GET shows a form, POST approves |
| Install-runtime hello   | `install_runtime.outreach_approved` | Backed by an `approved` row in `growth_install_runtime_links`; work-domain emails only                    |

Hello applies the same `PERSONAL_EMAIL_DOMAINS` exclusion as the digest, and
never approves from a CI install, a redacted install, or an install with two
different emails. It runs only when both `CAMPAIGN_ENROLLMENT_ENABLED` and
`GROWTH_INSTALL_RUNTIME_HELLO_ENABLED` are `true`, so a contact is never
approved before the immutable `CAMPAIGN_ENROLLMENT_START_AT` and stranded.
Founder approvals from the install digest have no such guard: a digest approval
made before `CAMPAIGN_ENROLLMENT_START_AT` is never enrolled.

Every send re-authorizes under the privacy lock immediately before Resend.
Contact deletion nulls `growth_install_runtime_links.contact_id` (the row stays,
so that runtime observation is never approved again) and deletes the
`growth_contact_scores` row.

## Replies

The Apps Script poller posts mailbox events to `/_/growth/replies/google`,
signed with `GOOGLE_REPLY_HMAC_SECRET`. The route answers 503 when the secret is
unset. A reply stops the contact and cancels pending steps.

- The poller must send `subject_sha256` computed exactly as
  `normalizeReplySubject` does (`tools/growth/src/lib/replies.ts`), byte for
  byte, or the subject fallback never matches. The message-id path still works
  once Resend message ids reconcile.
- The subject fallback has no sender authentication. A forged From with the
  campaign subject can stop that contact. It fails safe, because a stop only
  prevents mail.
- The BCC seed from design section 8.1 is not implemented yet: the sender
  sends no `bcc`. It arrives with the mailbox and the poller.

## Run it locally

```
npx nx check lifecycle
npx nx build lifecycle
npx nx test lifecycle
npx nx lint lifecycle
```

`nx check` and `nx build` go through the b4-cli wrapper (`scripts/b4-cli.mts`), which does not forward `b4 dev`; run `b4 dev` directly:

```
cd tools/lifecycle && npx b4 dev --env-file <private env file>
```

That runs the service against the test store with nothing sent. Keep the
variables in a private env file you do not commit (`DATABASE_URL`,
`B4_DATABASE_URL`, `LIFECYCLE_SERVICE_SECRET`,
`GROWTH_DATABASE_ENVIRONMENT=test`, `DELIVERY_ENVIRONMENT=test`,
`DELIVERY_ENABLED=false`).

`GROWTH_INTEGRATION=1 npx nx test-integration lifecycle` runs the integration
tests; it needs `TEST_DATABASE_URL`.

## Run a tick by hand

Against a preview or a deployed service, with the service bearer in `$SECRET`
and a fresh UUID v4 as the thread id:

```
curl -sS -X POST "$LIFECYCLE_URL/threads/$(uuidgen | tr A-Z a-z)/runs/wait" \
  -H "authorization: Bearer $SECRET" \
  -H "content-type: application/json" \
  -d '{"route":"/dispatch#workflow","input":{"trigger":"cron"}}'
```

The answer is the final state: `result` holds `leased`, `dispatched`,
`recoveryPaused` and `operatorAlerts`. Smoke checks without a tick:

```
curl -i "$LIFECYCLE_URL/healthz"                              # 401
curl -i -H "authorization: Bearer $SECRET" "$LIFECYCLE_URL/healthz"  # 200, x-hashbrown-deployment-id
curl -i "$LIFECYCLE_URL/readyz"                               # 401
```

The cron route: `GET /_/cron/lifecycle` on www with `CRON_SECRET` answers 200
`{ accepted: true, operator_alerts: [...] }`, 401 without it, and 503 when the
cron is disabled, the lifecycle URL or secret is missing, or the invoke fails.

## Preview dogfood

Use a preview deployment of `hashbrown-lifecycle` (label the PR `preview`) and
the test store, with `DELIVERY_ENVIRONMENT=preview` and
`GROWTH_DATABASE_ENVIRONMENT=preview`. Brian sets the preview allowlist and
redirect address on the Preview target of `hashbrown-lifecycle` only; this
runbook does not name it. The `brian@hashbrown.dev` mailbox does not exist yet,
so nothing in a preview run may depend on it receiving mail.

1. Scope a Preview `DATABASE_URL` on both projects to the PR branch with the
   test store value, apply migrations to the test store with
   `npx nx migrate-growth growth`, and redeploy. Remove the branch values
   afterward.
2. Smoke the service (previous section).
3. With `DELIVERY_ENABLED=false`, insert a fixture contact approved through
   `form.outreach_approved`, enable enrollment and the campaign, and run a tick.
   Expect `campaign.enrolled:v1`, three `send_step` jobs, and step 1 due at the
   next 07:00 Pacific. A tick inside the window defers step 1 with
   `delivery_disabled`. Two concurrent ticks lease a job once.
4. With `DELIVERY_ENABLED=true` and the allowlist, run a tick inside the window
   (a weekday at 07:xx Pacific). Expect Resend to accept step 1, the webhook to
   mark it delivered, and step 2 to move to three business days later.
5. Post a signed synthetic reply event. Expect a stop and steps 2 and 3
   cancelled.
6. Exercise the digest and hello paths with synthetic work-domain installs; a
   personal-domain pair must be ineligible.
7. Delete every fixture row, revert the dogfood `DATABASE_URL`, and run
   `npx nx run growth:report -- health`.

## Operator alerts and health

Logs from the cron (grep these):

| Log line                         | Meaning                                                           |
| -------------------------------- | ----------------------------------------------------------------- |
| `[lifecycle-operator-alert]`     | The tick returned an alert; the alert name follows                |
| `[lifecycle-cron-failed]`        | The invoke failed (network, non-2xx or invalid state); retry next |
| `[lifecycle-cron-misconfigured]` | `LIFECYCLE_CRON_ENABLED` is not exactly `true` or `false`         |

A `[lifecycle-cron-failed]` on every tick, with no job dispatched, means the
tick fails before leasing, which holds back all mail (`fulfill` and `notify`
included). Look for these causes:

| Cause                                 | Check                                                                                                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enrollment start mismatch             | `CAMPAIGN_ENROLLMENT_START_AT` differs from the value recorded in `campaign:v1:configuration` ("is immutable after campaign configuration")                                     |
| Email keyring coverage (hello)        | An email redaction uses a key version missing from `GROWTH_EMAIL_HMAC_*` (`identity_key_unavailable`), or a deleted contact is not fenced (`redaction_initialization_required`) |
| Environment mismatch (reconciliation) | `DELIVERY_ENVIRONMENT` and `GROWTH_DATABASE_ENVIRONMENT` differ ("Provider lookup requires matching environments and credentials")                                              |

| Alert                           | What to do                                                                                                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `mailbox_recovery_required`     | Mail depending on reply evidence is paused. The reply poller may have missed replies. Sends and reply reconciliation resume once the matching `mailbox.recovery_completed` activity is recorded. |
| `observation_projection_failed` | Mail is unaffected. Run `process` by hand (intake runbook) and read the error code.                                                                                                              |

A stall that raises no alert: later `send_step` jobs wait while an earlier sent
message for the contact has no `rfc_message_id`. Message-id reconciliation
retries with backoff up to hourly, forever, and raises nothing. Find stuck
messages with this read-only query:

```sql
select j.id, j.contact_id, j.kind, j.provider_email_id, j.updated_at
from growth_jobs j
join growth_contacts c on c.id = j.contact_id
where j.kind in ('fulfill', 'send_step')
  and j.status = 'completed'
  and j.provider_email_id is not null
  and j.rfc_message_id is null
  and c.deleted_at is null
  and j.updated_at < now() - interval '1 hour'
order by j.updated_at;
```

Rows here mean the Resend lookup is failing or the message id never arrives.
Check `RESEND_API_KEY` and the Resend dashboard for that email id.

Until PR 6's form route writes `framework`, the founder notification shows
"Framework: not given".

## Announcements

One catalog (`www/src/lib/announcements/catalog.ts`) feeds the site pill and
the runtime announcements. An entry reaches development collectors only when it
has a `runtime` block with a `hashbrown.dev/docs` link. The first runtime entry
(Get unstuck) arrives in PR 6.

## Manual steps still open

- Create the `brian@hashbrown.dev` mailbox and build the Apps Script mailbox
  poller (not built yet), with `GOOGLE_REPLY_HMAC_SECRET` set on www. Both
  block production delivery: without them replies bounce and are never
  detected, so a contact who answers step 1 would still get steps 2 and 3.
  The BCC seed (design section 8.1) arrives with them.
- Set the Resend webhook signing secret (`RESEND_WEBHOOK_SECRET`) on www.
- Choose and set `CAMPAIGN_ENROLLMENT_START_AT` when enrollment is enabled. It
  cannot be changed once recorded.
- Add `VERCEL_PROJECT_ID_LIFECYCLE` for CI. The `lifecycle` entry in
  `DEPLOY_TARGETS` is optional and is skipped while it is unset.

## Enable order

Production switches go on in this order (design section 14, item 7). Check a
tick's result and the alerts after each one before the next.

1. `GROWTH_OBSERVATION_PROCESSING_ENABLED`
2. `DELIVERY_ENABLED`. Prerequisite: the `brian@hashbrown.dev` mailbox exists
   and receives mail, the Apps Script poller is deployed with
   `GOOGLE_REPLY_HMAC_SECRET`, and one synthetic reply has been seen to stop a
   test contact.
3. `CAMPAIGN_ENROLLMENT_ENABLED` (with `CAMPAIGN_ENROLLMENT_START_AT`)
4. `CAMPAIGN_ENABLED`
5. `LIFECYCLE_CRON_ENABLED` (on www)
6. `GROWTH_INSTALL_DIGEST_ENABLED`
7. `GROWTH_INSTALL_RUNTIME_HELLO_ENABLED`

## Follow-ups

- Thread retention: b4run keeps one thread and its checkpoints per tick and
  nudge in the B4 store, and nothing deletes them yet. A retention sweep is a
  follow-up before PR 7.
- `reply_reconcile` jobs carry `contact_id` null, so contact deletion does not
  scrub their `in_reply_to`, `references` and `rfc_message_id` payload. A
  follow-up clears it.
- Before PR 7, a persistent non-deterministic handler error must stop blocking
  the batch: catch per job, defer with backoff, and quarantine after N
  attempts.
