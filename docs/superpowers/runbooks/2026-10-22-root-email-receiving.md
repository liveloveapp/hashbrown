# Hashbrown root-domain receiving

The operator authorized root receiving on 2026-10-22, then requested removal of legacy subdomain forwarding. Only `brian@hashbrown.dev` is an active incoming and recipient Reply-To address. The live-email canary remains waived.

## Active routing

Mail received at `brian@hashbrown.dev` is forwarded to the fixed `brian@cacheplane.ai` destination. Human replies use that mailbox’s identity. Other root aliases and the retired `brian@replies.hashbrown.dev` address are never admitted, matched, forwarded or enumerated by recovery.

Root mail uses the historical `brian@replies.hashbrown.dev` mailbox ledger identity and immutable `RESEND_INBOX_PILOT_STARTED_AT`. Keep `RESEND_INBOX_PILOT_ADDRESS` set to that internal identity on www and lifecycle. It is a database identifier, not an accepted mail address. Preserve its receipt history, recovery start and checkpoint; no migration or history rewrite is needed.

Admission, authoritative content validation, recovery enumeration and forwarding share one root-only recipient predicate. Existing reference matching, sender verification, canonical stops, privacy checks, provider-attempt keys and freshness gates remain active. Recovery runs every five minutes, lifecycle every ten. Do not enable campaign, delivery or enrollment flags merely to configure receiving.

## Setup

`npx nx inbox-setup growth` inspects root receiving only. `--apply` may enable receiving on the existing Hashbrown root domain; it cannot create the retired subdomain or another domain. DNS proposals contain only the root receiving MX, never sending records. Keep the root receiving credential server-side, the separate sending key, and both Hashbrown webhooks enabled.

Verify public root MX and Resend domain/receiving-record status. Run authenticated `/_/cron/inbox-recovery` and confirm the historical mailbox row is enabled, complete and fresh. A signed legacy-recipient or unrelated-root-alias event must return 200 without admitting a receipt. This endpoint check does not substitute for an actual email canary.

## Legacy retirement

Initial production preflight found zero received, pending or unforwarded messages. Disable legacy receiving first to prevent new subdomain mail during rollout. Deploy the root-only code. Repeat the receipt/pending/unforwarded audit immediately before deleting the unused legacy Resend domain and its exact generated DNS records; investigate any newly admitted work instead of silently deleting or completing it.

Snapshot the legacy domain and exact DNS records before deletion. Preserve root MX, root sending verification, server credentials, shared webhooks and historical ledgers. Keep historical SQL migrations immutable. Earlier pilot/cutover records describe prior routing and do not authorize recreating a fallback alias.

## Retry and recovery

Previously reserved but unaccepted sends retain immutable payload-conflict protection. Never change their key or clear an attempt to force a retry; inspect and reconcile them individually. Already accepted sends safely reuse provider acceptance.

If coverage is uncertain, pause delivery and retain root receiving while investigating. A failed forward or recovery must keep safety gates closed; never reset history to declare health. Re-enabling any retired address requires an explicit routing decision, matching code support and verified DNS before it can be used as Reply-To.
