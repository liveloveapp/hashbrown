# Invoicing example — local sample application

The React / Hashbrown / Pretable / B4 example includes a deterministic ledger
for a software consulting firm: **150 invoices, 149 incoming payments, and 144
historical allocations**, spanning October 2024 through September 2026. The
fixed simulated as-of date is **September 15, 2026**. Six fictional clients have
monthly retainers and realistic project invoice references.

Five incoming payments initially have unapplied cash totaling **$13,900**:

- Northstar Labs: exact invoice match ($2,400).
- Cedar Health: partial payment against a larger invoice.
- Harbor Commerce: one payment covering two invoices.
- Atlas Analytics: an ambiguous choice between two invoices.
- Summit Logistics: an advance with no outstanding invoice.

The assistant accepts questions immediately, without selecting a payment.
Selecting a row adds context. **Match payment** opens a separately authorized
allocation review; **Approve and apply** records the simulated allocation and
refreshes the balances. With multiple open invoices, choose an invoice first.
Combined payments are currently applied one invoice at a time, each with its
own approval. **Decline** leaves the ledger unchanged. Chat becomes available
again after a completed or safely retired review, and subsequent matching uses
a fresh review thread. Unknown allocation outcomes remain blocked until checked.

Dashboard includes ledger-derived totals and monthly invoiced/received data.
Payments default to unmatched items; All payments includes historical receipts.
A selected payment remains visible after matching to preserve context. There
are no real transfers, collections workflows, or payment reminders.

## Run locally

The server pins published `@b4run/cli`, `@b4run/langchain`, and `@b4run/sdk`
packages at **0.8.34** in its private npm workspace. A separate B4 checkout or
local package-linking step is no longer required.

From the repository root:

```sh
npm ci
INVOICING_ENV_FILE=/path/to/.env npx nx serve invoicing-server
```

In another terminal:

```sh
npx nx serve invoicing-react
```

The environment file must provide `OPENAI_API_KEY`; alternatively export the
key in the server environment. Credentials are loaded only by the server.
Both the root agent and nested structured UI generation use `gpt-5-mini`.
Open <http://127.0.0.1:4326/>. Vite proxies API and agent requests to port 4325.
Selection and chat survive Dashboard/Payments navigation. Matching is an
explicit action; selecting a record never initiates a financial proposal.

The root lockfile includes the server workspace and registry integrity hashes.
The temporary agent workspace resolves the same installed B4 packages as the
server, regardless of npm hoisting. No dependency points to a local B4 checkout.

## Authority and state

The server owns amounts, record versions, immutable proposals, operation IDs,
and session generations. Model UI props contain only a proposal ID. The
client fetches the session-owned proposal and verifies its pending interrupt
batch before enabling approval. It reads the recorded operation result before
refreshing balances, including when the approval stream fails after submission.
One unanswered interrupt holds the entire batch.

The review middleware binds B4 tools to the validated cookie session and exact
conversation. Proposed amounts come from server balances. Approval revalidates
records and applies the allocation synchronously with its recorded result.
Repeated identical decisions return that result; stale or conflicting decisions
and foreign-session proposals fail without changing balances.

HTTP-only SameSite cookies isolate browser sessions. Ledger and B4 history
start fresh together on server restart; this is single-process, temporary state,
not durable recovery. Each allocation-review thread owns one immutable proposal; the read-only
conversation uses its own route and thread. Cross-route, cross-session, and
pre-reset thread reuse are rejected. Cancellation
confirms no allocation was requested; it does not record a domain decline.

Session-scoped reads:

- `GET /api/snapshot`
- `GET /api/proposals/:proposalId`
- `GET /api/reviews/:threadId`
- `GET /api/operations/:operationId`

`POST /agui/%2Freview%23agent` and `POST /agui/%2Fassistant%23agent`
forward to the guarded B4 listener. The assistant route exposes only read-only
ledger capabilities and validated review suggestions. General
thread APIs and alternate agent routes are unavailable. There is no standalone
financial mutation endpoint. Shared DTOs and the identity-only component schema
live in `invoicing-contracts`; clients do not import server implementation code.

## Verification and next steps

Current verification: 133 unit/integration tests pass (93 server, 37 React,
3 contracts), all build/lint targets pass, and the real-model browser sequence
passes. See compatibility.md for the exact scenarios and limitations.

Run build, test, and lint with `invoicing-server`, `invoicing-react`, and
`invoicing-contracts`. React tests exercise actual Hashbrown rendering with a
controlled transport, including repeated reviews and safe failure retirement.
Server tests verify seed conservation, reset isolation, invoice-choice binding,
and cross-route/session/generation thread ownership.

The repeatable live browser check requires installed B4 packages, Chrome, and
server-only model credentials:

```sh
INVOICING_ENV_FILE=/path/to/.env npx nx live-model invoicing-e2e
```

It starts or reuses the local servers, creates fresh browser sessions, and
checks conversation, approval, cancellation, another approval, a follow-up
question, and isolation. It fails when credentials are missing rather than
silently skipping. `npx nx build invoicing-e2e` and `npx nx lint invoicing-e2e`
validate the test code. Browser artifacts go to `work/invoicing-e2e`.

Run the deterministic browser checks without model credentials:

```sh
npx nx test invoicing-e2e
```

This target uses separate ports 4329/4330 and a real seeded session store. Its
agent endpoint defaults to HTTP 503. An opt-in scripted approval scenario uses
the real proposal coordinator and session store; it never loads B4 or calls a
model. The checks cover ambiguous invoice selection, clearing an invoice choice
when switching payments, advance-payment gating, and failed-review retirement
with a fresh thread on retry. Those failure-before-approval cases assert unchanged
ledger data. A fourth case commits an approved allocation, discards the response,
and temporarily blocks result lookup. It verifies that new work stays blocked
until reconciliation restores the displayed balances without another approval.
This tests application recovery with a scripted transport; B4 authorization
remains covered separately by integration tests and the live-model check.
Failure traces go to `work/invoicing-deterministic`.

The server build type-checks; serve runs TypeScript directly. Existing warnings
include the large minified Vite chunk and terminal color settings.

Remaining work includes broader browser failure scenarios, durable state/refresh recovery, one-approval multi-invoice
allocation, and deliberate retirement of the older examples after reviewing
this replacement. See `compatibility.md` for dated verification evidence.
