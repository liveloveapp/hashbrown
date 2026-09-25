# Combined Payment Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One proposal allocates a payment across several invoices, so Harbor's combined payment takes one approval.

**Architecture:** `Proposal` gains `lines[]`; the ledger validates and applies all lines atomically; the review route binds a thread to an ordered invoice list and fills line amounts server-side; the assistant's `ReviewPayment` carries `invoiceIds`; React renders one card row per line.

**Tech Stack:** TypeScript, Vitest, React 19, B4 (`@b4run/sdk`), Hashbrown Skillet, Playwright. Spec: `docs/superpowers/specs/2026-09-25-invoicing-combined-approval-design.md`.

Commands (from the repo root):
`npx nx test invoicing-contracts`, `npx nx test invoicing-server`, `npx nx test invoicing-react`, plus `lint`/`build` for each, and `npx nx example-e2e invoicing-e2e`.

---

### Task 1: Contracts and ledger

**Files:**
- Modify: `examples/invoicing/shared/src/index.ts` (ProposalRequest, Proposal)
- Modify: `examples/invoicing/server/src/ledger.ts` (createProposal, applyProposal, new `fillLines`)
- Test: `examples/invoicing/server/src/ledger.spec.ts`

- [ ] **Step 1: Failing tests.** Change the file-level `request` to `{ paymentId: 'payment-001', lines: [{ invoiceId: 'invoice-001', amountCents: 240000 }] }`; amount cases patch `lines[0].amountCents`; version assertions read `proposal.lines[0].expectedInvoiceVersion`. Add tests over a two-invoice ledger (payment 500000, invoices 320000 and 180000):

```ts
test('a two-line proposal applies both invoices in one allocation set', () => {
  const ledger = twoInvoiceLedger();
  const proposal = createProposal(ledger, twoLines, ids);

  const next = applyProposal(ledger, proposal);

  expect(proposal.amountCents).toBe(500000);
  expect(next.allocations.map((a) => [a.invoiceId, a.amountCents, a.proposalId])).toEqual([
    ['invoice-a', 320000, 'proposal-001'],
    ['invoice-b', 180000, 'proposal-001'],
  ]);
  expect(next.activities).toEqual([
    { operationId: 'operation-001', proposalId: 'proposal-001', description: 'Payment applied to 2 invoices' },
  ]);
  expect(next.payments[0].version).toBe(3);
  expect(materialize(ledger, overlayOf(ledger, next))).toEqual(next);
});
```

Plus `test.each` rejections: `[]` → `invalid_lines`; 11 lines → `invalid_lines`; repeated invoice → `duplicate_invoice`; lines summing past the payment → `insufficient_balance`; stale version on the second invoice → `stale_version`. And `fillLines`:

```ts
test('fillLines gives each invoice what remains of the payment, in order', () => {
  expect(fillLines(400000, [{ id: 'a', outstandingCents: 320000 }, { id: 'b', outstandingCents: 180000 }]))
    .toEqual([{ invoiceId: 'a', amountCents: 320000 }, { invoiceId: 'b', amountCents: 80000 }]);
  expect(() => fillLines(100000, [{ id: 'a', outstandingCents: 320000 }, { id: 'b', outstandingCents: 1 }]))
    .toThrow('insufficient_balance');
});
```

- [ ] **Step 2:** `npx nx test invoicing-server -- ledger` → FAIL.
- [ ] **Step 3: Implement.** In `shared/src/index.ts`:

```ts
/** One invoice's share of a requested allocation. */
export interface ProposalLineRequest { readonly invoiceId: string; readonly amountCents: number; }
/** Untrusted request to prepare a payment allocation across one or more invoices. */
export interface ProposalRequest { readonly paymentId: string; readonly lines: readonly ProposalLineRequest[]; }
/** A stored line with the invoice version it was prepared against. */
export interface ProposalLine extends ProposalLineRequest { readonly expectedInvoiceVersion: number; }
/** Exact allocation prepared and stored by the server for review. */
export interface Proposal {
  readonly paymentId: string;
  readonly lines: readonly ProposalLine[];
  /** Sum of the line amounts. */
  readonly amountCents: number;
  readonly proposalId: string; readonly operationId: string; readonly generation: number;
  readonly proposalVersion: number; readonly expectedPaymentVersion: number;
  readonly customerId: string; readonly currency: string;
}
```

In `ledger.ts`, `MAX_LINES = 10`; `createProposal` validates per the spec and returns lines with `expectedInvoiceVersion`; `applyProposal` checks every version, revalidates via `createProposal(ledger, proposal, proposal)`, bumps the payment version by `lines.length` and each invoice by one, appends one allocation per line and one activity (`'Payment applied to invoice'` for one line, `` `Payment applied to ${n} invoices` `` otherwise). Export:

```ts
/** Fill invoices in order from a payment's unapplied cents; every invoice must receive a positive amount. */
export function fillLines(unappliedCents: number, invoices: readonly { readonly id: string; readonly outstandingCents: number }[]): ProposalLineRequest[]
```

- [ ] **Step 4:** Tests pass. Fix `session-store.spec.ts`, `http.spec.ts`, `review-coordinator.spec.ts` request literals to the `lines` shape so the server suite compiles.
- [ ] **Step 5:** Commit `feat(invoicing): let one proposal allocate across several invoices`.

### Task 2: Stored legacy proposals

**Files:** `examples/invoicing/server/src/session-store.ts` (`normalize`), test `session-store.spec.ts`.

- [ ] **Step 1: Failing test.** Seed a repository row whose `proposals` holds `{ paymentId, invoiceId, amountCents, expectedInvoiceVersion, … }` (no `lines`); `store.proposal()` returns it with `lines: [{ invoiceId, amountCents, expectedInvoiceVersion }]`, and `store.decide(… 'approve')` applies it.
- [ ] **Step 2:** FAIL. **Step 3:** In `normalize`, map `proposals` through `legacyProposal`, which rewrites `{invoiceId, expectedInvoiceVersion}` into one line and drops those keys. **Step 4:** PASS. **Step 5:** Commit `fix(invoicing): read single-invoice proposals stored before lines`.

### Task 3: Review route binds an ordered invoice list

**Files:** `persistence/types.ts` (`selectedInvoiceIds?: readonly string[]`), `review-coordinator.ts` (authorize/prepare/context), `review-middleware.ts` (`readPayment`, `prepareAllocation({ invoiceIds })` using `fillLines`), `review-tools.ts` + `app/review/tools/prepareAllocation.ts` (input `{ invoiceIds }`), `app/review/index.ts` prompt, `server/browser-fixture.ts`. Tests: `review-coordinator.spec.ts`, `review-middleware.spec.ts`, `review-tools.spec.ts`.

- [ ] **Step 1: Failing tests.** Middleware: state `selectedInvoiceIds: ['i1','i2']` on a payment of 15000 against two 10000 invoices → `prepareAllocation({ invoiceIds: ['i1','i2'] })` yields lines 10000 and 5000; `['i2','i1']` → `invoice_binding_conflict`; unbound with two candidates → `invoice_choice_required`; unbound with more than one id → `invoice_choice_required`. Coordinator: `selectedInvoiceIds` must be 1–10 distinct known invoices (`invoice_not_found`), and a thread bound to `['a','b']` rejects `['b','a']` (`thread_binding_conflict`); `prepare` compares whole line lists (`proposal_conflict`).
- [ ] **Step 2:** FAIL. **Step 3:** Implement. The prompt becomes: "Call prepareAllocation({invoiceIds}) exactly once. Use selectedInvoiceIds in order when provided; otherwise use the sole invoice with an outstanding balance." **Step 4:** PASS. **Step 5:** Commit `feat(invoicing): bind a review to an ordered list of invoices`.

### Task 4: Assistant offers one review for several invoices

**Files:** `shared/src/assistant-contract.ts` (`invoiceIds: s.anyOf([s.array('Outstanding invoice IDs to fill in order', s.string('An invoice ID')), s.nullish()])`), `shared/src/assistant-ui.ts` (`invoiceIds?: readonly string[] | null`), `server/src/assistant-ui.ts`, `app/assistant/tools/render.ts` doc, `app/assistant/index.ts` prompt, `assistant-contract.spec.ts`, `assistant-ui.spec.ts`, `app/assistant/evals/assistant.eval.ts`.

- [ ] **Step 1: Failing tests** in `assistant-ui.spec.ts`: Harbor `invoiceIds: [api, migration]` passes; `[]`, duplicates, an unknown id, another customer's invoice, a paid invoice, and a list the payment cannot reach (`fillLines` throws) each fail with a message naming `ReviewPayment.invoiceIds`; `null` passes.
- [ ] **Step 2:** FAIL. **Step 3:** Implement; prompt: "When one payment covers several invoices, offer one ReviewPayment whose invoiceIds lists them in the order to fill." Add eval case `harbor combined` (input "Which invoices does Harbor Commerce's combined payment cover?") expecting one ReviewPayment whose `invoiceIds` equals `sampleScenarios.combined.invoiceIds` as a set. **Step 4:** PASS; record the new fixture with `npx nx eval invoicing-server -- --record` if the harness supports it, else note it. **Step 5:** Commit `feat(invoicing): offer one review for a payment that covers several invoices`.

### Task 5: React

**Files:** `react/src/assistant-kit.tsx`, `assistant-workspace.tsx` (ReviewPayment label, `beginReview(paymentId, invoiceIds?)`, Session `invoiceIds`, header, `appliedSummary`), `review-chat.tsx` (`selectedInvoiceIds`, `validProposal`), `allocation-proposal.tsx` (rows per line, Total), `App.tsx` (grid passes `[invoiceId]`). Tests: `allocation-proposal.test.tsx`, `assistant-workspace.test.tsx`, `review-chat.test.tsx`, `App.test.tsx`.

- [ ] **Step 1: Failing tests:** card shows `INV-A` `$3,200.00`, `INV-B` `$1,800.00`, `Total` `$5,000.00`; button reads "Match to INV-A and INV-B"; confirmation "Applied $5,000.00 to INV-A ($3,200.00) and INV-B ($1,800.00). This payment is fully matched."; `validProposal` rejects `amountCents` ≠ sum of lines; review request state carries `selectedInvoiceIds`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement with a shared `listJoin(['a','b','c'])` → "a, b and c" in `ledger-views.ts`. **Step 4:** PASS. **Step 5:** Commit `feat(invoicing): approve a combined payment from one card`.

### Task 6: End to end, docs, verification

- [ ] Update `e2e/workflow.spec.ts` and `server/browser-fixture.ts` to `selectedInvoiceIds`; add the Harbor one-approval flow if the fixture supports it.
- [ ] Update `examples/invoicing/README.md` where it describes one review per invoice.
- [ ] Run test/lint/build for contracts, server, react; `npx nx example-e2e invoicing-e2e`; replay evals `npx nx eval invoicing-server`.
- [ ] Commit, rebase on `main` after #602 merges, open PR.
