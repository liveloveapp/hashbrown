# Root email receiving implementation plan

**Goal:** Receive Brian’s mail at `brian@hashbrown.dev`, forward it to `brian@cacheplane.ai`, and preserve replies to the old subdomain address.

**Approved design:** The operator requested the root-domain cutover after reviewing the routing tradeoff. Resend receives the root domain; the application admits only the two exact Brian addresses. Both share the original mailbox ledger identity and immutable recovery boundary, so no SQL migration or history rewrite is needed. New recipient emails use the root address as Reply-To. Existing provider attempts retain payload-conflict protection.

## Implementation

- [x] Write failing tests for root/legacy admission, authoritative matching, recovery enumeration, forwarding, and new Reply-To.
- [x] Add an exact recipient predicate shared by admission, processing, recovery and forwarding. Preserve the legacy canonical mailbox identity and all stop/privacy/attempt guards.
- [x] Change new recipient Reply-To to the root address. Do not alter sending or campaign activation flags.
- [x] Run growth, lifecycle and www build/test/lint; inspect the diff and normal CI.
- [ ] Merge and deploy through the normal PR workflow.
- [ ] Enable receiving on the existing root Resend domain, publish only its proposed root MX record, verify DNS/provider health, run recovery and document the cutover. Keep subdomain records and webhooks active.

## Operational evidence

Before cutover, Vercel DNS has no root MX and the Resend root domain is verified sending-only. The repository’s configured production mailbox is Brian; no other production root aliases were found. Resend will retain other root recipients, but the application does not forward or match them. The previous live-email canary waiver remains in effect; do not claim an end-to-end test passed.

Local build/test/lint passed for growth, lifecycle and www; code review found no blockers. Dedicated root and legacy database reply tests passed. The full database suite is being rerun after removing one corroborated orphan synthetic fixture fence that predated this task. Production campaign, enrollment and delivery controls were confirmed disabled; no root MX existed in provider or public DNS before cutover.
