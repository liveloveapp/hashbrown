# Hashbrown Resend Inboxes Pilot Implementation Plan

> **For agentic workers:** Execute inline with superpowers:executing-plans and test-driven-development. Review the completed changes before delivery.

**Goal:** Receive pilot replies at `brian@replies.hashbrown.dev`, match RFC message references, stop follow-ups, and recover missed notifications without changing root MX records.

**Architecture:** Keep the existing outbound API and canonical stop transaction. Add a durable inbound receipt ledger and mailbox health checkpoint, a signed receiving webhook, and an authenticated recovery command. Bind outbound Message-IDs from delivery events and retrieve missing bindings during recovery. Fail closed for campaign steps while pilot collection is unhealthy or a reply/binding is unresolved. Default configuration is disabled.

**Tech Stack:** Existing TypeScript, Neon SQL, Next.js route handlers, Resend REST API and webhook verifier, Vitest, Nx. No new dependencies.

## Tasks

1. Write failing tests for pilot configuration, RFC reference parsing/matching, receipt deduplication, early replies, wrong recipients, self-mail, and stop application; implement a focused reply module and migration.
2. Write failing tests for outbound binding and campaign gates; persist bindings in the delivery webhook and enforce mailbox health and unresolved reply/binding gates at leasing and final authorization. Make Reply-To pilot-configurable only with an exact approved subdomain address.
3. Write failing tests for signature verification and endpoint isolation; implement an inbound route that durably admits verified `email.received` events and applies stops, leaving delivery handling separate.
4. Write failing tests for REST pagination, partial failure and checkpoint ordering; implement recoverable enumeration, missing outbound binding lookup, pending receipt processing, and an operator Nx command. A successful recovery checkpoint must precede campaign sending; failures keep it blocked.
5. Document subdomain-only receiving and Inbox setup, credential scopes, allowlisted canary, root-MX snapshot comparison, recovery, cutover and rollback. Provisioning must not create root MX or enable campaigns.
6. Run build/test/lint for growth and www, database integration checks when a dedicated test store is available, and review the diff. Report live canary separately from local checks.

## Acceptance

- Verified inbound references bind only to Hashbrown jobs; sender/subject alone never authorize a stop.
- Normal and out-of-office replies use `stopContact` with `campaign.reply_received`, preserving idempotency, race accounting and requested fulfillment behavior.
- Duplicate notifications, retries, early replies, and recovery scans converge; no body or subject is persisted/logged.
- Missing/stale recovery checkpoints and pending work prevent campaign submission.
- Root-domain MX records remain untouched. Live canary failure leaves campaigns disabled.
- No production deployment, DNS mutation, or email transmission is implied by passing local tests.

## Approved scope amendments (2026-10-22)

The operator waived the live canary and selected `brian@cacheplane.ai` for human forwarding. Use direct Resend Receiving, because native Inbox thread reads do not expose the RFC references/raw content required by this implementation; never rely on unverified interoperability after waiving the canary. Root MX remains unchanged and campaign activation is separate.

B4 phase-3 review adds mandatory `app=hashbrown` delivery filtering, environment-scoped provider keys, durable 23-hour first-attempt/payload-digest guards, job-creation-time unsubscribe URLs, strict multipart one-click unsubscribe, and enforced mailbox/reply gates. Forwarding has independent replay/recovery and HMAC tombstone checks before sending.

Live credential setup requires explicit approval because Resend supports receiving reads only with `full_access`, despite the local READ variable name. An approval-review rejection of creating that broader key leaves activation blocked while code, DNS, additive migrations and disabled webhook provisioning can complete.

## Activation completion

The operator approved the dedicated full-access receiving key. Production configuration, prebuilt deployment, both Hashbrown webhooks and the five-minute recovery schedule are active. Initial recovery and fresh database health were verified, with no live email canary sent. Root MX and campaign flags remain unchanged. See the runbook for deployment identifiers and verification evidence.
