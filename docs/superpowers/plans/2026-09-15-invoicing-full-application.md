# Invoicing Full Application Implementation Plan

> Use superpowers:subagent-driven-development for bounded tasks and independent review.

**Goal:** Replace the one-record proof with the approved two-year software-consulting ledger and a usable assistant that can answer questions and initiate explicitly approved allocations repeatedly.

**Architecture:** Keep session-owned immutable proposals and allocation authority. Separate read-only conversation from isolated payment-review threads so terminal approvals cannot authorize subsequent actions. Selection adds context; explicit matching actions launch a review. The assistant can answer without selection. Each review preserves its original batch and operation verification.

**Tech Stack:** Existing React, Pretable, Hashbrown, TypeScript B4, Nx, Vitest, Playwright. No new dependencies.

## Approved scope

User approved continuing the full arc after requesting usable chat and the full seeded ledger. Two years of deterministic software-consulting invoices and incoming payments; no collections. Maintain Dashboard/Payments and open chat. Keep historical activity and several unapplied scenarios. Real model interaction with simulated financial mutations. The fixed demo as-of date is September 15, 2026 (October2024–September2026 history). Published B4 verification remains distinct from the fixed local build.

## Tasks

- [x] Seed: add optional customer/date/reference metadata to MoneyRecord; create deterministic 24-month seed with historical allocations, unmatched exact, partial, ambiguous, and multi-invoice payments. Keep createLedger as focused regression fixture, inject production seed into runtime store. Test determinism, conservation, dates, IDs, scenario invariants, isolation/reset.
- [x] Conversation: add a session-scoped read-only B4 route with ledger context and trusted text component output. No financial tools on that route. Test missing session/schema/route rejection. Real chat can discuss any ledger record with optional selected payment context.
- [x] Repeated reviews: preserve current guarded review route per fresh review, render past reviews read-only, allow new reviews after terminal state, block conflicting actions during pending approval. Add explicit match action and explain pending composer gating. Preserve operation-result recovery.
- [x] UI: show client names, received dates, references, allocation status; filter unmatched/all payments with unmatched first. Selection only adds context. Add monthly invoiced/received view to Dashboard and bounded related invoice display. Test selection does not mutate/start a review, chat before selection, repeated review ownership.
- [x] Verification: run build/test/lint for contracts/server/react, exercise real-model question before selection, approve a seeded unmatched payment, decline another, continue chat afterward, verify session isolation. Document results and startup; commit coherent work.

## Follow-on scope

Dedicated repeatable browser target, registry artifact installation, and careful retirement of old samples follow the working seeded application. Do not remove old examples before their replacement is verified. Multi-invoice payments may be allocated one invoice at a time, each explicitly approved, while preserving the unapplied remainder. Ambiguous matches must ask the user to select an invoice rather than silently choose.

## Review

Independent plan review required a shared session/route/generation thread guard,
authoritative action validation, and unknown-outcome gating. Implemented.
Code review found an empty-completion lock and possible stale failed approval
surface; both are fixed and covered by lifecycle regression tests. Re-review
found no remaining blocking correctness/security issues. Live verification is
recorded separately in the compatibility checkpoint.

Final evidence: 93 server + 37 React + 3 contract tests pass; all corresponding
build/lint targets pass. E2E build/lint and the real-model browser sequence pass
(final run 1m39s). Missing model credentials cause an explicit failure. The
seeded Payments layout was visually inspected after adjusting column widths.

## Follow-on verification progress — September 15, 2026

- [x] Published B4 0.8.34 and Zod 4 integration, with a passing real-model browser sequence.
- [x] Add a separate model-free browser target using actual session/seed reads and a deliberately failing agent endpoint.
- [x] Cover ambiguous invoice choice, choice reset across payment selection, advance gating, and failed review retirement/retry without mutation.
- [x] Browser coverage for a lost approval response and explicit operation-result reconciliation using a scripted transport and real domain state.
- Deferred beyond V1 by user decision: browser-refresh recovery and durable persistence.
- [ ] Inventory legacy deployment and conformance dependencies before proposing retirement.

The deterministic browser target is deliberately bounded to existing behavior;
it does not expand the financial mutation surface or introduce persistence.

## V1 merge scope

The user requested merging V1 on September 15, 2026. Recovery across refreshes
or server restarts is not required for this example. Existing operation-result
checks remain. Deployment and legacy-example retirement are separate changes.
