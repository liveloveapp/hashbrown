# Hashbrown root-domain receiving

The operator authorized moving receiving to `hashbrown.dev` on 2026-10-22. This supersedes the earlier pilot’s root-MX restriction. The live-email canary remains waived.

## Routing and compatibility

- Primary incoming and new recipient Reply-To address: `brian@hashbrown.dev`.
- Legacy incoming alias: `brian@replies.hashbrown.dev`, retained for replies to already-sent mail.
- Human forwarding destination: `brian@cacheplane.ai`. Human replies still use that mailbox’s identity.
- The application admits only those two exact addresses, case-insensitively. Other root recipients remain visible in Resend Receiving but are not forwarded or used for campaign stops. Add any future aliases deliberately with regression coverage.
- Both addresses use the original `brian@replies.hashbrown.dev` mailbox ledger identity and immutable `RESEND_INBOX_PILOT_STARTED_AT`. Keep `RESEND_INBOX_PILOT_ADDRESS` set to that identity on www and lifecycle. It is an internal recovery identifier, not the new outward-facing reply address. No data migration or new mailbox/checkpoint is needed.
- Admission, authoritative content validation, recovery enumeration and forwarding share the exact same recipient predicate. Existing reply matching, canonical stops, privacy checks, provider-attempt keys and freshness gates are unchanged.

## Cutover

1. Confirm the root DNS has no existing MX records and inventory configured mailbox aliases. Before this change, the root Resend domain is verified sending-only; no Hashbrown Gmail mailbox exists.
2. Merge and deploy the two-address receiver and root Reply-To through normal CI, covering www and lifecycle. Preserve existing campaign/delivery/enrollment flags.
3. Enable receiving on the existing Resend `hashbrown.dev` domain. Fetch its authoritative DNS proposal; publish only the root receiving MX record at Vercel DNS. Preserve root sending verification and all subdomain DNS records.
4. Ask Resend to verify, confirm authoritative/public root MX resolution and enabled receiving. Keep the existing account-scoped inbound and delivery webhooks enabled.
5. Run authenticated recovery and verify the original mailbox row is enabled, complete and fresh. Preserve the original boundary and any pending receipts. A signed event for a different root address should be ignored. Do not substitute that endpoint check for an actual email canary.

## Retry and rollback considerations

Changing Reply-To changes the provider payload for a previously reserved but unaccepted send. Its retry must fail `payload_conflict`; never change the key or clear the attempt to bypass that protection. Inspect/reconcile any such attempts individually. Already accepted sends safely reuse the provider acceptance. New sends use the root address.

If coverage is uncertain, pause delivery first. A failed forward or recovery must keep the existing safety gates closed; never reset history to declare health. Code rollback can restore subdomain Reply-To while retaining both-address admission. Removing the root MX alone stops root mail delivery, so keep root receiving active until mail addressed there is explicitly accounted for. Historical pilot details remain in [the original runbook](2026-10-22-resend-inboxes-pilot.md).
