# Growth Enable (PR 7) Plan

> **For agentic workers:** this plan is mostly operational. Its one code task follows the usual test-first rules; every production switch is flipped only after Brian's explicit go-ahead for that stage, in chat.

**Goal:** Turn the growth lifecycle on in production, in the order design §14 item 7 and the lifecycle runbook's "Enable order" give, with a checked tick between every switch. At the end, the founder sequence sends to approved contacts, the install digest reaches Brian on weekdays, install-runtime hello approves contacts, and the Get unstuck form accepts questions.

**Spec:** `docs/superpowers/specs/2026-10-20-growth-lifecycle-design.md` §14 item 7. Runbooks: `2026-10-21-growth-lifecycle-service.md` ("Enable order", "Operator alerts and health", "Run a tick by hand"), `2026-10-22-root-email-receiving.md`.

## State found on 2026-10-22 (read-only check of production variable names)

- Lifecycle has every switch present; www has `RESEND_WEBHOOK_SECRET`, `RESEND_INBOUND_WEBHOOK_SECRET` and the inbox-pilot variables, so the mailbox and webhook manual steps look done.
- `LIFECYCLE_CRON_ENABLED` exists on **lifecycle** but not on **www**, where the cron route and the nudge read it. Today no tick runs in production.
- `GROWTH_UNSTUCK_FORM_ENABLED` is unset on www (off). `CAMPAIGN_ENROLLMENT_START_AT` is unset (correct while enrollment is off).
- Spec §14 item 7's delivery gate ("mailbox receives mail, the reply poller is deployed, a synthetic reply stopped a test contact") predates #698/#702: Gmail polling is retired and the root-receiving runbook records that Brian waived the live-email canary. Stage B below replaces the gate with a signed synthetic reply against a test contact.

## Global Constraints

- One switch per step, in runbook order. After each: run a tick (by hand before the cron is on, then the next cron tick), read its result and `operatorAlerts`, and check the growth health report. Any alert or failed tick stops the rollout; switching back to `false` is the rollback.
- Never print secret values. Change Vercel variables through the API or CLI, then redeploy the affected project (lifecycle or www) so the value is read.
- `CAMPAIGN_ENROLLMENT_START_AT` is immutable once recorded. It is set once, from Brian's answer, in canonical `YYYY-MM-DDTHH:MM:SS.mmmZ`.
- Sends only happen inside the Monday–Friday 07:00–08:00 Pacific window. Stage C is timed so the first window is one Brian can watch.

## Task 1 (code): the fallback address becomes brian@hashbrown.dev

`brian@hashbrown.dev` now receives mail (root-receiving runbook), so the form's off-state fallback and the runbook point there instead of `brian@liveloveapp.com`.

- Files: `www/src/lib/growth/form-route.ts` (`UNSTUCK_FALLBACK_ADDRESS`), `www/test/growth/form-route.spec.ts`, the lifecycle runbook's Get unstuck section.
- Test first, then `npx nx test www && npx nx lint www && npx nx build www && npx nx e2e www`. Commit `feat(www): point the unstuck fallback at brian@hashbrown.dev`.
- This ships in the PR with the runbook record of each stage (dates, ticks, alerts).

## Stage A: readiness (read-only, no approval needed)

1. `npx nx inbox-setup growth` (inspect only): root MX and receiving verified.
2. Authenticated `/_/cron/inbox-recovery`: the mailbox row is enabled, complete and fresh.
3. Tick by hand against production with every switch off: `ok`, no alerts.
4. `GROWTH_PUBLIC_ACTION_ORIGIN` is a bare HTTPS origin (checked by the tick: no `action_origin_invalid`).

## Stage B: observation, delivery, and a synthetic reply (approval 1)

1. `GROWTH_OBSERVATION_PROCESSING_ENABLED=true` → tick, no `observation_projection_failed`.
2. `DELIVERY_ENABLED=true` → tick. Founder notifications that were waiting now go to `FOUNDER_NOTIFICATION_EMAIL`. Brian confirms one arrived.
3. Synthetic reply: a fixture contact (Brian's own address, approved), a signed synthetic inbound event referencing its send, and a check that the contact gains a reply stop. Fixture rows are deleted afterwards.

## Stage C: enrollment and campaign (approval 2, needs the start time)

1. `CAMPAIGN_ENROLLMENT_START_AT=<Brian's choice>` and `CAMPAIGN_ENROLLMENT_ENABLED=true` → tick: contacts approved at or after that instant are enrolled; the count is reported to Brian before the next step.
2. `CAMPAIGN_ENABLED=true` → the next send window sends step 1 to the enrolled contacts.

## Stage D: cron (approval 3)

1. `LIFECYCLE_CRON_ENABLED=true` on **www** (and remove the stray copy on lifecycle, which nothing reads) → redeploy www; the next scheduled call answers 200.

## Stage E: digest, hello, and the form (approval 4)

1. `GROWTH_INSTALL_DIGEST_ENABLED=true` → the next weekday window sends Brian the digest.
2. `GROWTH_INSTALL_RUNTIME_HELLO_ENABLED=true` → tick, hello approvals recorded.
3. `GROWTH_UNSTUCK_FORM_ENABLED=true` on www → redeploy; a real submission from Brian is acknowledged, notifies Brian, and enrolls with reason `unstuck_form`.

## After

Update the runbook's "Manual steps still open" and the spec's §14 item 7 delivery gate to match what was done, record each stage's date, and merge the PR.
