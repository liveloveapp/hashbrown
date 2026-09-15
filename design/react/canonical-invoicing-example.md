---
Created: 2026-09-14
Affects: React example application, Hashbrown, Pretable, B4, example documentation and CI
Status: Visual direction approved — compatibility-proof planning
---

# Canonical invoicing and incoming-payments example

## Objective

Replace the existing showcase applications with one canonical React application
that demonstrates Hashbrown through a coherent small-business workflow. Use
Pretable for the central financial grids and B4 for the TypeScript agent.

The application represents a fictional software consulting firm. Financial
records and payment application are simulated; model interactions are real.
The central interaction is **select payment → suggest allocation → approve →
update the ledger**.

## Confirmed product decisions

- The first version is React and uses Hashbrown, Pretable, and B4.
- The central workspace is a stateful financial data grid with a chat sidebar
  and supporting components around the grid.
- Use a basic shadcn sidebar for primary navigation, with Dashboard and Payments
  as the two entries. These entries replace the earlier proposed
  payments/invoices top-level view arrangement.
- Dashboard is the initial landing page. The Hashbrown chat sidebar is open by
  default on both Dashboard and Payments.
- Focus on invoicing and incoming payments. Collections, overdue chasing, and
  payment reminders are excluded.
- Seed two full years of synthetic financial data for a software consulting
  firm, with repeatable scenarios built from those records.
- V1 is USD-only. Currency conversion and exchange-rate handling are excluded.
- The public demo requires no sign-in. Each visitor has isolated, resettable
  financial data; visitors do not share mutation state or approval ownership.
- Start with pre-existing invoices. Generating invoices from time entries or
  project milestones is outside V1.
- Payment-to-invoice matching is the main approval workflow.
- Selecting an unapplied payment starts matching automatically. Routine matching
  requires no chat prompt.
- A clear match takes two clicks: select the payment, then **Approve and apply**.
- Do not add a second confirmation dialog. Keep changes and ambiguous choices
  inline; editing is an exception rather than the default path.
- The eventual replacement includes retiring the existing showcase applications.
  No application removal or implementation is part of this draft.

Earlier investment-portfolio and trade-execution proposals are superseded by
this invoicing direction.

## Proposed workspace

Use a basic shadcn sidebar on the left with Dashboard and Payments navigation.
Dashboard contains the business overview; Payments contains the central
Pretable payment-matching workspace. Keep the Hashbrown chat sidebar on the
right, open by default on both pages. Dashboard is the initial landing page.
The user approved the interactive visual concept on September 14, 2026.
Use its layout as the baseline; precise responsive dimensions can be refined
during implementation.

The approved visual concept places the approval card inside the right chat
sidebar and related invoice context below the payment grid. Selecting a
payment reveals the proposed allocation and an **Approve and apply** action;
approval updates the payment status and invoice balance together. The
interactive concept uses local sample interactions, with adjustable chat width
and row spacing; it does not exercise Hashbrown, Pretable, B4, or a live model.

Approved Dashboard composition: three summary cards for Invoiced, Received,
and Unapplied cash; a monthly invoiced-versus-received chart; and a short list
of payments needing matching. Clicking a payment in that list opens Payments,
selects the corresponding record, and starts matching automatically. This
shortcut preserves the select-then-approve path without a second selection.

Invoice records remain available as related context and matching candidates
inside the workspace; Invoices is not a third top-level navigation entry in
the agreed sidebar. Keep the active payment, relevant invoices, and allocation
proposal visible together without requiring extra navigation to approve.

The payment grid shows customer, received date, amount, reference, applied
amount, unapplied amount, and matching status. The invoice view shows customer,
invoice number, project, issue date, due date, total, credits, amounts applied,
and remaining balance. Due dates are factual invoice fields, not a collections
queue.

Supporting summaries show invoiced amounts, money received, applied payments,
and unapplied cash for the selected period. Do not label invoices as recognized
revenue or imply a full accounting system.

The chat sidebar supports questions about the current selection and broader
business data. The user can ask why a match was proposed or compare periods,
but routine matching does not require typing. Generated components should
explain the selected records or show a concrete proposal rather than duplicate
the entire grid.

## Proposed matching workflow

1. Selecting an unapplied payment starts an analysis scoped to that payment.
2. B4 tools read current server-owned payment and invoice records. They compute
   candidate balances and possible allocations deterministically.
3. The model uses those results to propose a match and explain it. Treat the
   model's output as a proposal, not an authoritative balance calculation.
4. Hashbrown streams progress and renders a trusted allocation component with
   invoice identifiers, amounts to apply, and any unapplied remainder.
5. A server interrupt requests approval for the exact stored proposal.
6. **Approve and apply** submits the complete response batch. The application
   resolves the Hashbrown interrupt using the batch ID originally displayed.
7. The server validates and applies the simulated allocation transactionally.
8. Authoritative balances and activity update in the workspace.

For ambiguity, present candidate invoices directly instead of requiring a chat
exchange. A changed allocation becomes a revised proposal that is validated
before approval; approval of an older proposal must not authorize a revision.
Declining or leaving a proposal does not alter the ledger.

### Few-click constraints

- One recommended allocation for a clear case; do not force users through a
  wizard or an editor.
- Show a short explanation and actionable amounts on the approval surface.
- Use an inline **Change match** action for exceptions.
- Disable repeated submission while an approval is applying.
- Keep selection stable when balances update; do not unexpectedly move the
  user to another payment after completion.
- Proposed: retain a separate review context for each visited payment during
  the live session. Switching requires no confirmation, and returning restores
  its suggestion. Each approval remains bound to its original payment and
  proposal version, regardless of which grid row is now selected.
- Do not send new-payment input into a runtime paused on another payment's
  interrupt. Retaining a review includes retaining its live runtime ownership;
  copying a batch ID into a different runtime cannot restore that approval.
- Bulk matching is a possible later extension, not an accepted V1 requirement.

## Data model and seed

Proposed records are business, customer, project reference, invoice, invoice
line, credit note, incoming payment, allocation, allocation proposal, and
application activity. Projects identify invoice context; they do not introduce
time tracking or a project-management subsystem.

Use stable identifiers, a fixed seed and application clock, and an explicit
scenario manifest. Proposed initial scale is 24 fictional customers, roughly
60 project references, 1,200 invoices, and 1,000 incoming payments spanning
January 2024 through December 2025, with a fixed as-of date of December 31,
2025. These counts are seed-generation targets, not business constraints or
performance claims. Include realistic service descriptions and seasonal changes
without real customer information or live financial feeds. Show the simulated
date so users do not interpret the records as current financial information.

Use integer cents for monetary amounts and the explicit currency code USD.
Derived balances must reconcile
against invoices, credits, and allocations; narrative generated by a model
does not change them.

The seed should include settled historical records as well as a small, useful
set of unapplied and partially applied payments. Interesting cases should be
discoverable immediately rather than buried in a large dataset.

### Seed construction and invariants

Generate the seed in dependency order: customers and project references,
invoices and lines, credits, payments, then allocations. Derive displayed
balances from those records rather than generating unrelated totals.

- Invoice line amounts sum to the invoice total under the seed's explicit
  rounding rules. Tax computation is outside the example's matching workflow;
  any seeded tax amounts are already recorded invoice amounts.
- Credits and allocations cannot make an invoice's remaining balance negative.
- Allocations cannot exceed a payment's received amount, and unapplied cash is
  its received amount minus valid allocations.
- Payment and invoice records must belong to the same demo business and
  customer for an allocation to be applied. Unknown customer identity requires
  clarification, not an assumed cross-customer match.
- Every row uses a stable record ID. A displayed row index, filter position,
  invoice amount, or customer name is not an allocation identity.
- Historical events have coherent dates. Scenario fixtures use the fixed clock
  instead of the host machine's current date.

Create most settled history first, then add explicit scenario records. Store
each scenario's record IDs and expected results in a manifest. Avoid relying
on random generation to happen to produce an interesting case.

### Initial golden scenarios

All amounts below are synthetic USD examples. The fixture stores integer cents.

| Scenario | Starting records | Expected result |
| --- | --- | --- |
| Exact match | $2,400 payment and one $2,400 invoice with a matching reference | Approval applies $2,400; both remaining balances are zero |
| Partial payment | $1,200 payment against a $3,000 invoice | Approval leaves $1,800 on the invoice and no unapplied payment balance |
| Multiple invoices | $4,000 payment referencing invoices for $1,800 and $2,200 | One proposal allocates both amounts and one approval applies it |
| Unapplied remainder | $3,500 payment and a $3,000 invoice | Approval applies $3,000 and preserves $500 as unapplied cash |
| Ambiguous match | $1,500 payment without a useful reference and two eligible $1,500 invoices | Present an inline choice; no application until an exact allocation is approved |
| Customer mismatch | Equal amounts on records belonging to different customers | Never allocate across customers solely because amounts match |
| Stale proposal | An invoice receives another allocation after the proposal is shown | Reject the stale proposal without partial writes and refresh the review |
| Duplicate approval | Repeat an already-applied operation | Return its recorded result; balances and financial activity do not change twice |

The Payments view should make the exact-match example immediately accessible.
A compact scenario selector can navigate to other known records;
it should not be a prerequisite for using the workspace.

## Demo session behavior

No sign-in is required for the public demo. Each visitor receives an isolated
logical copy of the seed; their allocations
cannot alter another visitor's records. The public reference data is shared,
but mutation state, proposals, and agent threads are scoped to the session.

Proposed access boundary: the server establishes an opaque browser session.
Every ledger read, agent thread, proposal, and application operation is checked
against that session. A payment ID, proposal ID, or AG-UI thread ID supplied by
the browser is insufficient to access a different visitor's data. The browser
does not select its authoritative session identity in a request body.

A **Reset demo** action restores that session's starting state and invalidates
its proposal and operation ownership before new matching can begin. Late
callbacks from the prior session generation cannot mutate the reset ledger.
Reset is an exceptional destructive action; it is not part of the two-click
payment workflow.

Proposed: retain domain changes over a browser refresh for the session lifetime.
Reconcile applied operations from the server on refresh. Do not silently replay
an approval or pretend that the old Hashbrown batch was restored. An unfinished
review must obtain a fresh, validated approval context before it can be applied.
On return to an unfinished payment review, the proposed default is to refresh
that review automatically from the server's proposal and balances and present
a new approval context. The user is not asked to reconstruct an interrupt or
understand thread IDs. If the operation already applied, show the result rather
than another approval button. A session that has expired starts from the seed
with a visible explanation. The expiration interval is deployment configuration.

Anonymous access does not imply unlimited model execution. Apply server-side
session/request limits and bounded agent/tool work. Exact budgets and hosting
choices remain implementation-design decisions.

### Proposed review and recovery states

| State | What the user sees | Financial behavior |
| --- | --- | --- |
| Not reviewed | Unapplied payment row | Selecting it starts matching |
| Matching | Inline progress for the selected payment | Read-only tools; no allocation applied |
| Needs clarification | Candidate invoices and an inline choice | No allocation applied |
| Awaiting approval | Exact allocation, explanation, and Approve and apply | Proposal is immutable for this approval context |
| Applying | Button disabled and inline progress | Server claims the operation and validates versions |
| Applied | Confirmation, updated balances, and activity | Recorded result is returned for repeat delivery |
| Stale proposal | Refreshed suggestion or an actionable validation result | Original approval cannot authorize a revised allocation |
| Outcome unknown | Checking payment status | Query the server operation before permitting any new application |

Switching the visible payment does not approve, reject, or reinterpret the
previous payment's proposal. In-memory review contexts retain their own
Hashbrown runtime, B4 thread, proposal version, and original interrupt batch.
An applying operation can finish while another payment is visible; its result
updates its own records. The active panel must not display its approval or
completion as if it belonged to the newly selected payment.

After a lost connection, distinguish Hashbrown transport recovery from the
business outcome. Before acknowledgment, a retry may deliver the same decision;
the server operation still applies at most once. After acknowledgment, retire
the failed runtime as required by Hashbrown and reconcile the server operation.
Only establish a fresh review after confirming the earlier operation is not
still running or already applied.

## Ownership and integration boundaries

### Pretable

Own grid rendering and interactions through its public React APIs. Adapt useful
patterns from the existing portfolio example: stable selection under streaming,
wrapped narrative, summaries, and inline exception handling. Do not copy its
recorded analyst commentary or direct quantity-edit mutation as the new agent
or ledger behavior.

### Hashbrown

Own the React agent interaction, streaming projections, trusted generated UI,
and interrupt/resume presentation. Selection and view context can inform the
agent, while server tools remain authoritative for financial records.

Keep the local interrupt batch ID distinct from durable application proposal
IDs. Hashbrown does not restore pending batches after page reload or runtime
recreation; the application must define its refresh/recovery experience.

### B4 and the application server

B4 owns agent execution, tools, and the approval interruption. The application
server owns the simulated ledger, proposal versions, validation, and duplicate
application protection. A B4 checkpoint alone is not proof that a business
action cannot be applied twice.

Persist the result of an approved operation under a server-owned operation ID.
Repeated delivery of the same decision returns the recorded result. Reject
conflicting or stale proposal decisions without changing balances. Re-read
payment and invoice versions when applying a proposal; if balances changed,
refresh the suggestion instead of applying a now-invalid allocation.

Model credentials stay on the server. Browser-supplied IDs and amounts do not
make a payment or allocation authoritative. Demo session isolation and reset
behavior must be chosen before deployment.

### Compatibility milestone before application implementation

**September 15 progress:** B4's generalized request-envelope and concurrent
message fixes merged in PRs #657 and #660. A connected React/Hashbrown browser
proof passed with live B4 root and nested models and one-operation approval.
Published Pretable 0.19.0 passed real checkbox select/clear checks. Release
PR #661 merged to prepare B4 0.8.33; registry publication is pending. The
independent ledger/session implementation passes 29 tests plus build and lint; the complete application
flow and two-year dataset remain outstanding. Current evidence and exact public
imports are in `samples/invoicing/compatibility.md`.

The following local-source observations are historical discovery notes:

Local references inspected:

- Pretable: `/Users/blove/repos/pretable`, remote `cacheplane/pretable`.
- B4: `/Users/blove/repos/dawn`, remote `cacheplane/b4run`. The inspected source
  still contains Dawn package names and documentation terminology.
- Hashbrown: `packages/core/src/transport/hashbrown-run-agent-input.ts` and the
  merged interrupt/resume design.

The inspected B4 AG-UI package manifest declares `@dawn-ai/ag-ui` version
`0.8.21` and AG-UI dependencies `0.0.57`; Hashbrown's merged implementation was
verified against `0.0.59`. These are source-checkout observations, not a choice
of published installation versions. The proof must record the actual paired
versions and exercise wire compatibility rather than assume matching behavior
from package names.

B4's current AG-UI documentation describes an SSE route, durable interrupted
threads, and top-level resume entries. Its permission examples use payloads
such as `"once"`; an application approval payload must follow the selected B4
capability's contract rather than assume a generic `{ approved: true }` shape.

Verify the actual paired versions for:

1. A real model turn through B4 rendered by Hashbrown.
2. Selection context reaching application tools without trusting client ledger
   values.
3. Structured output and Hashbrown's `hashbrown.responseSchema` / `hashbrown.ui`
   request extensions producing usable trusted UI.
4. A standard interrupt, displayed proposal, and matching resume decision.
5. A server-owned operation applying once and updated domain data reaching the
   grid.

Do not assume generic AG-UI support guarantees shared-state projection or
Hashbrown-specific UI output. Determine whether existing B4 application hooks
suffice or a separately reviewed adapter change is needed. No new dependency
versions have been selected or installed.

Additional source inspection found that B4's current
`packages/cli/src/lib/dev/agui-handler.ts` validates the request with
`RunAgentInputSchema`, then invokes `streamRoute` with the newest user message
and an optional resume decision. That invocation does not forward the raw
request's state, tools, or Hashbrown extension into the route input. Its
`packages/ag-ui/src/inbound.ts` explicitly leaves tools/state/context
uninterpreted. The reviewed outbound translator does not expose an application
state-event path alongside its token, tool, and interrupt cases.

These are concrete boundaries for the compatibility milestone, not proof that
all B4 application extension points are unavailable. Preserve and test the
selected request fields explicitly rather than relying on unknown fields
surviving validation. Keep any necessary reusable protocol support in the
appropriate library, with the application's ledger logic outside that adapter.

## Proposed delivery sequence

Treat this as three separately reviewable changes:

1. **Compatibility proof:** a minimal React/Hashbrown client, B4 route, and one
   synthetic payment/invoice pair. Prove selection context, real model output,
   a trusted proposal component, interruption, approval, at-most-once simulated
   application, and authoritative state refresh. Identify and independently
   review any required library changes. Do not remove existing examples.
2. **Canonical application:** build the Pretable workspace, isolated seed data,
   scenario fixtures, retained payment reviews, and session recovery around the
   proven integration. Add deterministic CI and a bounded live-model smoke path.
3. **Showcase retirement:** remove the agreed legacy samples and migrate their
   CI, docs, links, and deployment references only after replacement coverage
   and a working canonical deployment exist.

The next implementation plan should cover the compatibility proof first. The
remaining application and retirement work should not be bundled into the same
initial change.

## Scenario-based testing

Each deterministic scenario starts from a known seed snapshot and describes
expected domain state rather than exact model prose.

- Exact one-payment/one-invoice match.
- Partial payment with the remaining invoice balance preserved.
- One payment allocated across several invoices.
- Unapplied remainder after an allocation.
- Ambiguous candidates requiring an inline user choice.
- Incorrect model allocation rejected by deterministic validation.
- Declined proposal leaving the ledger unchanged.
- Duplicate approval returning the prior result without a second allocation.
- Stale invoice or payment version requiring a refreshed proposal.
- Selection changes and slow responses not presenting the wrong payment's
  approval.
- Transport failure before and after resume acknowledgment, with explicit
  domain-state reconciliation.
- Two-year period comparisons matching deterministic financial calculations.

Use deterministic model fixtures in CI and a small separately configured live
model evaluation path. User-facing demo interactions use real models; recorded
text must not be presented as live model output.

## Rollout and retirement

Design and validate the canonical application's end-to-end path before removing
the existing showcases. Retirement must cover sample source, Nx projects,
dependencies, CI references, deployment targets, public links, and documentation.

Preserve or replace the framework conformance coverage that currently uses the
Smart Home examples. A React-only showcase does not remove Hashbrown's Angular
support or justify deleting its independent runtime smoke fixtures.

Deleting repository example code and decommissioning deployed sites are separate
changes with distinct inventories. Final removal scope and rollout sequencing
remain to be reviewed.

## Open decisions

- Confirm proposed per-payment review retention when navigating.
- Confirm proposed seed scale/date range and scenario entry points.
- Confirm proposed session recovery and reset behavior.
- Precise B4 approval capability and structured/shared-state integration.
- Deployment shape and published dependency versions.
- Which existing showcase applications and hosted sites are retired.

## Design review

An independent review on September 14, 2026 approved this draft as sufficient
for planning the initial compatibility proof. The review found no serious
completeness, consistency, clarity, or scope gaps for that bounded milestone.
It did not approve all later product proposals or turn this document into an
implementation plan.

The user approved the visual concept on September 14, 2026. This confirms the
workspace layout and Dashboard composition described above; it does not resolve
the remaining technical or lifecycle proposals. The first implementation plan
covers the bounded compatibility proof. The full application and showcase
retirement remain separate later design/plan stages.
