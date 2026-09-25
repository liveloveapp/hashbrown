# Invoicing: let the assistant drive the work

Date: 2026-09-25. Scope: `examples/invoicing`.

## Problem

A Chrome walkthrough of <https://invoicing.hashbrown.dev> found the assistant
and the matching controls disconnected:

1. The assistant column scrolls away with the page, and a long answer pushes
   the composer off screen.
2. The assistant's `ReviewPayment` button dead-ends ("Select this payment in
   the grid and choose an invoice") whenever the payment has more than one
   open invoice, even when the assistant named the invoice.
3. A combined payment needs one review per invoice.
4. Nothing confirms an applied allocation; the review collapses, and a
   partially applied payment still reads "Unmatched".
5. Internal IDs (`payment-harbor-combined`) appear in prose and on the
   approval card; answers open with an unrequested disclaimer.
6. Approve and Decline look identical, and the card does not show what stays
   unapplied.
7. Payment references and customer names truncate while half the grid is
   empty; the assistant's table scrolls inside a 310px column.
8. Enter does not send, the empty assistant offers no starting questions, and
   user messages look like answers.
9. 87 text nodes render at 10px.
10. Found while testing the fix: the selected payment never reached the model.
    The middleware validated `state.selectedPaymentId`, but B4 passes run
    state only to tools, so "this payment" could not work.

## Decision

Two pull requests.

**PR 1, UI (this spec).** Fixes 1, 2, 4 to 9 and softens 3.

**PR 2, server.** One proposal covers several invoices, so a combined payment
takes one approval. It changes `Proposal`, `createProposal`/`applyProposal`,
review middleware, persistence and the approval card, and gets its own spec.

## PR 1 design

### Layout

- `.workspace` fills the viewport; `main` scrolls on its own.
- The assistant column is `100vh` and never scrolls with the page. It holds a
  header, a scrolling thread (payment context, messages, reviews, notices) and
  the composer pinned at the bottom.
- Reviews render inside the thread, after the messages, not below the
  composer. The thread scrolls to its end when a message or review arrives.
- The column widens to 380px (320px under 1100px). Under 800px the layout
  stacks as today and the column is not pinned.

### ReviewPayment names its invoice

- `reviewPaymentConfig` gains `invoiceId: string | null` (nullish, like
  `customerId`). The server's `assistant-ui` validation accepts it only when
  the invoice exists, belongs to the payment's customer and currency, and has
  an outstanding balance; otherwise `invalid_ui` names the problem.
- The button reads "Match to INV-…" when it carries an invoice and starts that
  review directly.
- Without an invoice and with several candidates, the button selects the
  payment on the page, scrolls the match controls into view and focuses the
  invoice picker instead of posting a dead-end notice.
- The assistant prompt tells the model to pass `invoiceId` when the match is
  clear, to offer one `ReviewPayment` per invoice for a payment that covers
  several, never to show internal IDs, and to answer before any caveat.

### The selected payment reaches the model

- A read-only `selectedPayment` tool returns the payment selected on the page
  with its candidate invoices, or `selected: null`. The assistant middleware
  closes over the validated `selectedPaymentId`, as the review route does with
  `readPayment`. The prompt tells the model to call it for "this payment".

### Feedback and status

- An applied review leaves a visible confirmation in the thread: "Applied
  $3,200.00 to INV-202609-HC-103. $1,800.00 of this payment is still
  unapplied." (or "This payment is fully matched.").
- The grid's Status reads Unmatched, Partially matched or Matched.

### Approval card

- Shows client, payment reference, invoice reference and amount; no internal
  IDs and no separate Currency row.
- Adds "Left unapplied after this" for the payment.
- Approve and apply is the primary (filled) button; Decline is secondary.

### Composer and thread

- Enter sends; Shift+Enter adds a newline.
- An empty thread offers three starter questions; with a payment selected the
  first becomes "Which invoices does this payment cover?". Clicking one sends
  it.
- User messages render as right-aligned bubbles.

### Readability

- No text under 12px. The payment grid uses flexible columns so references
  and customer names fit.

## Testing

Tests first, top-level `test(...)` only:

- `assistant-ui.spec.ts`: `invoiceId` accepted, rejected for another
  customer, another currency, a paid invoice, an unknown ID; `null` passes.
- `assistant-workspace.test.tsx`: a `ReviewPayment` with `invoiceId` starts a
  review for that invoice; without one and with several candidates it calls
  the choose-invoice callback; the applied confirmation text; Enter sends and
  Shift+Enter does not; starter questions send.
- `App.test.tsx`: Partially matched status; choose-invoice focuses the picker.
- `allocation-proposal.test.tsx`: no internal IDs; remaining unapplied shown.
- Replay evals must still pass. Live evals are noisy (main's prompt failed
  one case in each of two runs), so the prompt was compared over several
  `--live` runs; wording that asks the model to "open with the answer itself"
  measurably hurt table precision and was dropped.
- Chrome walkthrough of the same flow on the local build.
