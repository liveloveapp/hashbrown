# Invoicing: approve a combined payment once

Date: 2026-09-25. Scope: `examples/invoicing`. Follows
`2026-09-25-invoicing-assistant-ux-design.md` (PR 1, #602).

## Problem

A proposal allocates one payment to one invoice. Harbor Commerce's combined
payment covers two invoices, so the assistant offers two "Match to INV-…"
buttons and the user runs two reviews and approves twice. Between them the
payment reads Partially matched, and if the second review fails or is declined
the payment stays half applied.

## Decision

One proposal carries several lines, one per invoice, and one approval applies
all of them atomically. Considered and rejected:

- A batch of single-invoice proposals approved together: keeps `Proposal`
  unchanged but spreads atomicity across the coordinator, the session store and
  the operation record.
- Client-side sequencing of single reviews behind one click: not atomic, which
  is the defect being fixed.

## Design

### Contracts (`shared/src/index.ts`)

```ts
/** One invoice's share of a proposed allocation. */
export interface ProposalLineRequest {
  readonly invoiceId: string;
  readonly amountCents: number;
}
/** Untrusted request to prepare a payment allocation. */
export interface ProposalRequest {
  readonly paymentId: string;
  readonly lines: readonly ProposalLineRequest[];
}
/** A line as stored, with the invoice version it was prepared against. */
export interface ProposalLine extends ProposalLineRequest {
  readonly expectedInvoiceVersion: number;
}
export interface Proposal {
  readonly paymentId: string;
  readonly lines: readonly ProposalLine[];
  /** Sum of the lines. */
  readonly amountCents: number;
  readonly proposalId: string;
  readonly operationId: string;
  readonly generation: number;
  readonly proposalVersion: number;
  readonly expectedPaymentVersion: number;
  readonly customerId: string;
  readonly currency: string;
}
```

The top-level `invoiceId` and `expectedInvoiceVersion` are removed.

### Ledger (`server/src/ledger.ts`)

- `createProposal` rejects: no lines or more than 10 (`invalid_lines`); a
  repeated invoice (`duplicate_invoice`); an unknown record
  (`record_not_found`); an invoice for another customer or currency
  (`incompatible_records`); a line amount that is not a positive safe integer
  (`invalid_amount`); a line above its invoice's outstanding balance, or lines
  summing above the payment's unapplied amount (`insufficient_balance`). It
  records each invoice's version on its line and the total on the proposal.
- `applyProposal` checks the payment version and every line's invoice version
  (`stale_version`), re-validates through `createProposal`, then appends one
  allocation per line, all with the proposal's `proposalId`, and one activity:
  "Payment applied to invoice" for one line, "Payment applied to N invoices"
  otherwise. The payment version advances once per line and each invoice's once,
  which is how `materialize` already counts, so rebuilt overlays still equal
  applied ledgers.

### Stored sessions (`server/src/session-store.ts`)

Session rows already hold single-invoice proposals. `normalize` rewrites any
stored proposal that has `invoiceId` and no `lines` into a one-line proposal
with the same identity and versions, so pending reviews and recorded
operations survive the deploy. Nothing is migrated in the database; the next
commit writes the new shape.

### Review route

- The thread binding and request state change from `selectedInvoiceId?:
  string` to `selectedInvoiceIds?: readonly string[]` (1 to 10 distinct known
  invoice IDs). `authorize` compares the arrays in order when binding.
- `prepareAllocation` takes `{ invoiceIds: string[] }`. When the thread is
  bound to invoices, the input must equal the binding. Without a binding it
  keeps today's rule: exactly one invoice, and only when it is the sole
  candidate. The server sets amounts: it walks the invoices in the given order
  and gives each `min(remaining payment, invoice outstanding)`, dropping
  nothing; a line that would get 0 is an `insufficient_balance` error rather
  than a silent omission.
- `readPayment` returns `selectedInvoiceIds`.
- The review agent prompt says to pass `selectedInvoiceIds` when present.
- The proposal-conflict check in `prepare` compares the whole line list.

### Assistant

- `reviewPaymentConfig` replaces `invoiceId` with `invoiceIds`, a nullable
  array of invoice IDs. `assistant-ui` validation applies today's per-invoice
  checks to each ID and rejects duplicates, an empty array, and a list in which
  the payment runs out before a later invoice would receive any amount (the
  same fill rule the review route uses).
- The prompt: when one payment covers several invoices, offer one
  ReviewPayment with all their `invoiceIds` in the order to fill; pass a single
  ID when one invoice clearly fits; pass none when ambiguous.
- The button reads "Match to INV-A" or "Match to INV-A and INV-B" (three or
  more: "INV-A, INV-B and INV-C").
- The Atlas replay fixture is re-recorded if its render args change. A new
  eval case asks which invoices Harbor's combined payment covers and expects a
  single ReviewPayment carrying both Harbor invoice IDs.

### React

- `beginReview(paymentId, invoiceIds?)`; the review session and
  `ReviewChat` carry `selectedInvoiceIds`. The grid's Match button passes its
  one picked invoice as a one-element array.
- `validProposal` checks `lines` (non-empty, each with a string `invoiceId`
  and positive safe integers) and that `amountCents` equals their sum.
- Approval card: Client, Payment, then one row per invoice (reference and
  amount), Total when there is more than one line, and Left unapplied.
- Review header: "Payment review · PAY-… → INV-A, INV-B".
- Confirmation: "Applied $5,000.00 to INV-A ($3,200.00) and INV-B ($1,800.00).
  This payment is fully matched." One line keeps today's wording.
- No internal IDs anywhere; missing references use the PR 1 fallbacks.

## Out of scope

- A multi-invoice picker in the grid's manual Match path.
- User-edited line amounts on the approval card.

## Testing

Tests first, top-level `test(...)` only.

- `ledger.spec.ts`: two-line proposal created and applied; each rejection
  above; stale invoice version on the second line; `materialize(overlayOf())`
  equality after a two-line apply.
- `session-store.spec.ts`: a stored legacy proposal normalizes and can still be
  decided; a two-line decision records one operation.
- `review-coordinator.spec.ts` / `review-middleware.spec.ts`: binding by
  invoice list, order-sensitive conflict, amount filling, the unbound
  single-candidate rule.
- `assistant-ui.spec.ts`: `invoiceIds` accepted, duplicates, empty and foreign
  invoices rejected, `null` passes.
- React: two-line card rows and total; confirmation wording; button label;
  `validProposal` rejects a total that disagrees with its lines.
- Playwright workflow spec and the browser fixture move to
  `selectedInvoiceIds`; add the Harbor one-approval flow.
- Replay evals pass; live evals compared over several runs as in PR 1.
