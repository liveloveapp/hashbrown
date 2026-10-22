# Hashbrown Resend receiving pilot

## Decision and live state

The operator waived the live email canary on 2026-10-22 and requested forwarding to `brian@cacheplane.ai`. This waiver does not authorize a root-domain MX cutover or general campaign activation.

Use **Resend Receiving directly**, rather than creating a native Resend Inbox. The documented Inbox thread-email API omits the RFC reference headers and raw MIME required by this implementation. Receiving exposes both. Do not assume mail assigned to a native Inbox remains available through the Receiving API; that compatibility was an explicit canary gate, now avoided by this design.

- Receiving domain: `replies.hashbrown.dev`; verified in Resend.
- Accepted address: exactly `brian@replies.hashbrown.dev`.
- Sending identity: `Brian at Hashbrown <brian@hashbrown.dev>`.
- Human destination: fixed `brian@cacheplane.ai`, with Reply-To set to the original sender. Brian's replies therefore come from his Cacheplane mailbox; sending human replies as the Hashbrown address is a separate mailbox/client configuration.
- Only the receiving subdomain and its DNS descendants were configured. A before/after comparison of Vercel root MX configuration was identical (zero configured root MX records). Existing root sending verification remains untouched.
- Migrations through `0006_growth_provider_attempts.sql` were applied to the production growth database.
- Production is active at `https://hashbrown.dev` on deployment `dpl_CkMK34rjgZvWWUgnTFUY9T697tZb`. The approved dedicated receiving key is installed server-side; both Hashbrown webhooks are enabled and initial recovery completed. The live email canary is **waived**, never “passed.”

Provider references: [Receiving content](https://resend.com/docs/api-reference/emails/retrieve-received-email), [Inbox thread emails](https://resend.com/docs/api-reference/inboxes/get-thread-email), [API key permissions](https://resend.com/docs/api-reference/api-keys/create-api-key), [idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).

## Configuration

Install these server-side values on the deployment hosting the webhook/recovery and on any future lifecycle sender. Preview remains disabled. Never enable the same receiving address against two databases.

| Variable | Value |
| --- | --- |
| `RESEND_INBOX_PILOT_ENABLED` | `true` after provisioning; default absent/`false` |
| `RESEND_INBOX_PILOT_ADDRESS` | `brian@replies.hashbrown.dev` |
| `RESEND_INBOX_PILOT_STARTED_AT` | Fixed UTC activation boundary; retain across redeploys/recovery |
| `RESEND_INBOX_PILOT_ALLOW_ALL_RECIPIENTS` | `true` records the operator's canary waiver; retains all mailbox/reply safety gates |
| `RESEND_INBOX_PILOT_RECIPIENT_ALLOWLIST` | Optional restricted-pilot recipients when the preceding waiver flag is absent |
| `RESEND_INBOX_READ_API_KEY` | Dedicated server-only Resend receiving credential |
| `RESEND_INBOUND_WEBHOOK_SECRET` | New receiving webhook signing secret |
| `RESEND_WEBHOOK_SECRET` | Separate Hashbrown delivery webhook signing secret |
| `RESEND_API_KEY` | Existing Hashbrown domain-scoped sending key |
| `CRON_SECRET` | Existing bearer secret, at least 32 characters |
| `DATABASE_URL` | Existing deployment growth database |
| `GROWTH_DATABASE_ENVIRONMENT` | Explicit `production`, `preview`, or `test` |
| `GROWTH_EMAIL_HMAC_ACTIVE_VERSION` / `GROWTH_EMAIL_HMAC_ACTIVE_SECRET` | Existing contact lookup keyring; retain previous versions for erased-sender checks |

Resend currently offers only `sending_access` and `full_access`; receiving reads require `full_access`. A variable named READ does not confer a read-only provider permission. This shared-account credential needs explicit approval and server-only storage. Do not deploy the provisioning PAT as a shortcut.

Keep existing delivery, tracking and token policies. Do not enable `CAMPAIGN_ENABLED`, `DELIVERY_ENABLED`, or enrollment merely to activate receiving. The current lifecycle dispatcher uses these same pilot flags and mailbox gates. It runs every ten minutes; inbox recovery runs every five minutes.

## Provisioning and deployment

Supply `RESEND_PROVISION_API_KEY` (the older `RESEND_PROVISIONING_API_KEY` spelling also works) through local secrets:

```sh
npx nx inbox-setup growth
npx nx inbox-setup growth -- --apply
```

Default is read-only. Apply manages only the exact Resend receiving subdomain; it does not write DNS or create a native Inbox. Publish reviewed DNS proposals only under `replies.hashbrown.dev`. The first live setup also verified subdomain sending records; root MX remains unchanged.

1. Snapshot root MX records and DNS-provider configuration. Compare again after setup.
2. Verify the receiving subdomain. Apply migrations with the correct database preflight via `npx nx migrate-growth growth`.
3. Deploy the www routes and install production-only configuration. Register `https://hashbrown.dev/_/webhooks/resend-inbound` for `email.received`, using its own signing secret.
4. Register the delivery endpoint `https://hashbrown.dev/_/webhooks/resend` for sent, delivered, delivery_delayed, bounced, complained, suppressed and failed events. Preserve other projects' endpoints. Only Hashbrown-tagged events enter the ledger.
5. Enable webhooks after deployment. Run initial recovery and confirm health; check the deployed authenticated five-minute cron.
6. Confirm root MX is still identical. No live email canary is required by the operator, so report that it was waived and end-to-end mail delivery remains unverified.

## Reply matching, stopping and forwarding

The signed webhook durably admits only ordinary `email.received` events for the exact pilot recipient, from the fixed start onward. The processor fetches authoritative provider content and matches `In-Reply-To` first, then bounded `References`, to persisted outbound RFC Message-IDs. Sender must match the known contact. Subject or sender alone never authorizes a stop. Out-of-office replies follow the same policy.

Matched replies call canonical `stopContact` with `campaign.reply_received`; this preserves cancellation, idempotent activity and bounded in-flight send race accounting. Missing bindings, ambiguous references and sender mismatches remain recoverable. Unrelated and self-mail are ignored for stopping.

Forwarding is independent: failed human delivery cannot undo a stop, and failed reply processing still attempts human delivery. Every admitted non-erased message goes to the fixed Brian address, including unrelated mail. The original MIME is attached as `original.eml` so original attachments remain available; rendered content is transient. Downloads are HTTPS-only, reject redirects, and have a 20 MiB cap. Oversized/unavailable messages remain recoverable failures, visible in Resend, rather than silently succeeding. Bodies and subjects are never stored in the growth ledger or logs.

Contact erasure scrubs associated reply evidence. Before forwarding, the implementation checks deletion under the privacy guard, including HMAC lookup tombstones, so delayed association cannot revive erased mail. A bounded provider send retains the shared privacy lock through submission; erasure waits for an already-authorized submission to resolve.

## Retry and shared-account safeguards

- Recipient sends and forwards have `app=hashbrown`, an explicit environment and bounded job tags. Delivery rejects explicit foreign app tags before looking up jobs. Legacy tagless events require an authoritative stored provider ID and existing corroboration; unknown tagless events never write or stop a contact. Only product-tagged sends get retryable unmatched handling.
- Provider keys are `hashbrown:{environment}:{sha256(source)}`. Products/environments cannot collide under shared-account keys.
- `growth_provider_attempts` commits the first-attempt timestamp and SHA-256 of the exact payload before submission. Changed content under the same key is refused. Unknown attempts expire at **23 hours**, before Resend's 24-hour deduplication boundary. Known acceptance can finalize without another send, even later.
- Use `createUnsubscribeActionUrlForJob` for future send rendering: the issued time is `job.createdAt` and nonce is the job ID. Retain the same origin/signing key during retries; drift is rejected by the payload ledger.
- Campaign sends recheck the send window after reserving an attempt. Unknown provider outcomes remain failed closed under the existing jobs policy; this pilot does not introduce automatic campaign retries.
- The lifecycle dispatcher runs every ten minutes so ten-minute retries can fit the morning send window; it rechecks that window before submission. The separate five-minute cron handles receiving recovery.
- One-click unsubscribe accepts strict URL-encoded and multipart POST forms. Duplicate fields, files, unexpected fields and oversized requests are rejected.

## Recovery and health

```sh
npx nx inbox-recover growth
```

`www/vercel.json` schedules `/_/cron/inbox-recovery` every five minutes, authenticated by `CRON_SECRET`; the route permits 300 seconds on a supporting Vercel plan.

Recovery starts a generation, backfills outbound bindings (including older jobs accepted after activation), enumerates every receiving page, processes durable pending replies, and independently retries all unforwarded non-erased receipts regardless of stop status. It publishes the **scan start** as coverage only after successful processing/forwarding, only for the current generation, with no unread receipts.

Partial scans, failed provider calls, conflicting bindings, superseded generations and unread receipts cannot publish health. Gaps over 29 days require manual investigation because Receiving retains 30 days. Never move the start forward to bypass missing history.

Campaign leasing and final submission enforce `mailbox_recovery_required` and `reply_binding_pending`. Missing/recovering/stale (>10-minute) health and unread receipts block campaign steps globally; known-contact unresolved replies and relevant missing bindings block that contact. Unknown references with no known contact remain pending without permanently blocking unrelated contacts.

Inspect mailbox health and receipt identifiers/status/error codes with bounded queries. Investigate unavailable content in Resend. Do not bulk-complete receipts or manually advance health to release sends. Document a reviewed-ignore activity and update only the reviewed receipt under the inbox advisory guard, then rerun recovery.

## Rollback and legacy Gmail

Disable campaign delivery first if reply coverage is uncertain. Preserve the receipt/attempt ledgers and fixed start. Disable receiving webhooks/cron only after campaigns are paused. Roll back Reply-To by disabling the pilot flag; new campaign sends still need an explicit delivery-policy decision. Do not delete recovery evidence.

The operator explicitly requested Gmail polling removal. Hashbrown’s Google reply intake and polling credential provisioning are removed; the deployed Google HMAC credential is retired. The operator confirmed Hashbrown never had Gmail or an Apps Script trigger installed. Threadplane’s distinct poller is being removed separately by the operator. Already-admitted historical reconciliation can drain without further Gmail polling. **New replies to historical root-address emails are no longer collected by Hashbrown.** Root MX and Google mailbox/account contents remain unchanged; this does not cancel Google Workspace.

## Verification record (2026-10-22)

- `npx nx build growth` and `npx nx lint growth`: passed.
- `npx nx test growth`: 84 script tests and 232 Vitest tests passed.
- `NODE_ENV=production npx nx build www`, `npx nx test www`, and `npx nx lint www`: passed; 429 www tests passed. An earlier build with an inherited nonstandard Node environment failed rendering Next's global error page; the explicit standard production build passed without an application-code workaround.
- Existing dependency/API Extractor warnings remain (forgotten exports/TSDoc warnings), as does Next's existing middleware-to-proxy deprecation warning. No new dependencies were added.
- Dedicated test-database integration: 30 passed, 1 failed. The pilot early-reply/binding/stop/follow-up gate/erasure case passed. The existing strict schema-inventory test fails because the test store already contains `growth_contact_scores`, `growth_install_digest_reports`, and `growth_install_runtime_links`, absent from this checkout's migration inventory. No tables were dropped and the assertion was not weakened.
- Read-only API audit: receiving setup reports `ready`; both Hashbrown webhooks report `enabled` after deployment/health checks. No native Inbox was created.
- The operator explicitly approved the dedicated `full_access` receiving credential after automatic approval review requested that authorization. It was created and installed only in Hashbrown www production server configuration and ignored local secrets. The provisioning PAT was not deployed as a substitute.
- Live email canary: waived by operator, not performed. Hashbrown Google intake and its polling credential are retired; root routing remains unchanged.

## Production activation record

- Production deployment: `dpl_CkMK34rjgZvWWUgnTFUY9T697tZb`, [hashbrown.dev](https://hashbrown.dev), built with the repository CI-equivalent `vercel build --prod` and uploaded as a prebuilt archive. Remote source-build attempts failed before promotion due to API build directory layout; permanent project build settings were preserved.
- Initial authenticated recovery: HTTP 200, zero pilot messages received/processed. Database checkpoint `2026-10-22T20:00:52.363Z` was confirmed complete and fresh.
- Recovery without authorization: HTTP 401. Inbound without a signature: HTTP 400. Validly signed foreign-recipient event: HTTP 200 with no admitted pilot receipt. No email was transmitted for these checks.
- Vercel project confirms recovery cron enabled, `*/5 * * * *`, at `/_/cron/inbox-recovery`.
- Resend receiving webhook `184a443b-8ae9-4603-8637-ee73d33965cc` and delivery webhook `b40b7b73-f944-4629-8369-33f041cc4cb3`: enabled after health verification.
- Root MX configuration still exactly matches the pre-pilot snapshot (zero root records). No general campaign/enrollment/delivery flag was enabled.
- This deployment contains the local `codex/hashbrown-resend-inboxes-pilot` changes. Integrate this branch before the next routine deployment so an older source revision does not remove the pilot routes and safety gates.

## Current-main integration and Gmail retirement

The operator confirmed Hashbrown never had Gmail or a Hashbrown Apps Script trigger installed, and is removing Threadplane’s poller separately. This change removes Hashbrown’s unused Google intake/signing API, provisioning path and deployed HMAC secret. Historical database fields and already-admitted reply reconciliation are preserved; new campaign eligibility is gated by Resend coverage rather than old Google recovery activity.

Current-main lifecycle integration covers campaign/fulfillment plus founder/digest sends, with fixed job-time tokens, product/environment tags and durable provider attempt guards. Lifecycle dispatch runs every ten minutes; receiving recovery remains every five minutes. Production lifecycle routing/safety flags are installed without giving the sending service the account-wide receiving credential or enabling delivery/enrollment/campaign flags. The lifecycle migration was applied while all previous migration filenames/checksums were preserved.

Verification after integration: growth build/test/lint, lifecycle build/test/check/lint, www build/test/lint and normal pre-commit checks passed. Dedicated growth database integration passed all59 tests across14files. A fixture cleanup correction removes only the synthetic fences owned by each inbox test; the clean run left zero email fences. The old strict inventory mismatch is resolved by incorporating main’s lifecycle migration.

The final review added legacy delivery compatibility: pre-rollout tagless bounce/complaint/suppression events still stop contacts only after matching a stored provider ID and corroborating the job. Explicit foreign-product events remain rejected before database access. Lifecycle database integration also passed all3 tests.
