# Bounded ledger queries for the invoicing example

Status: required again by user scope revision. Bounded ledger access and
performance verification are part of the expanded canonical example. No runtime
changes have been made yet.

## Problem

The conversational agent is instructed to call readLedger on every question.
Without its optional customer filter, that tool returns all 149 payments and 150
invoices, plus monthly totals and overlapping unapplied/outstanding record lists.
A measured tool response was about 87 KB. This is not a realistic data-access
pattern, and returning the same history repeatedly adds unnecessary context.

The full seeded ledger stays on the server. The browser grid's existing snapshot
is separate from the model context and is outside this change.

## Options

1. Recommended: typed summary, filtered list, and detail tools. Server-computed
   aggregates answer totals and trends; bounded record queries support matching
   and explanation. This provides explicit, testable semantics.
2. Keep one readLedger tool with modes and pagination. Fewer tool names, but mixes
   aggregate and record semantics and makes accidental broad reads easier.
3. Model-generated SQL. More flexible, but adds query authorization and execution
   constraints unnecessary for this in-memory V1.

## Proposed behavior

Replace the all-record readLedger response with these read-only operations:

- getLedgerSummary: optional customer, date range, and monthly grouping. Returns
  exact server-calculated totals and counts separated by currency, with applied
  filters and an as-of date. No raw transaction arrays. Monthly grouping is opt-in
  and capped at 24 buckets; broader requests require a narrower range.
- listPayments and listInvoices: customer, date range, status and reference
  filters; stable ordering; default 20 records, hard maximum 50; explicit total
  count and next-page cursor. Pages contain concise fields useful for the query.
- getPayment and getInvoice: retrieve one record by ID, including bounded related
  allocation information with explicit truncation and pagination if necessary.
  All lookups and cursor validation remain scoped to the current session.

Provide a compact customer directory (six entries in the sample) and selected
record ID as context. Do not attach the entire selected customer's history.
The agent fetches fresh data appropriate to the question, rather than calling a
full-ledger tool each turn. Never infer global totals from a page of records.

For example, “How much cash needs matching?” uses summary totals and counts.
“Which payments need matching?” uses a filtered payments page. “Why this match?”
fetches that payment and relevant customer invoices. “Compare the last two years”
uses monthly server aggregates, without enumerating paid invoices.

Dates filter receipt dates for payments and invoice issue dates for invoices.
Unapplied/outstanding balances describe current balances of those filtered
records, not reconstructed historical balances. Responses state this scope.
Use integer cents, explicit currencies, validated filter values, and deterministic
ordering. Include the snapshot revision/generation in cursors; reject stale or
incompatible cursors so a changing ledger cannot silently skip or duplicate rows.

## Boundaries

Keep B4's public API, Hashbrown component schemas, approval authorization, and
session lifetime unchanged. No database, generic query language, collections,
recovery system, or new dependency. Lower reasoning effort is a separate measured
experiment, so its effect is not confused with this data-access change.

## Verification

Write failing server tests for bounded defaults, filter combinations, deterministic
pagination, invalid/stale cursors, customer/session isolation, exact aggregates,
currency separation, date semantics, and fresh balances after allocation. Assert
that summary results do not include raw record arrays and that record results
never exceed their limit. Test the normal summary response stays below 4 KB for
the seeded fixture; this is a fixture regression check, not a global guarantee.

Run affected build/test/lint and existing approval regression scenarios. Compare
real-model answers, tool payload sizes and time to first UI for totals, unmatched
payments, selected-payment explanation, and a two-year trend question. Verify a
same-thread follow-up sees an intervening allocation. Record all results; do not
claim this resolves the earlier intermittent failure unless that failure is
reproduced and specifically corrected.
