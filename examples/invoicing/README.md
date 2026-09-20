# Invoicing example — local sample application

The React / Hashbrown / Pretable / B4 example includes a deterministic ledger
for a software consulting firm: two years of invoices and payments for twelve
fictional clients billed in USD, EUR and GBP, generated from a fixed seed by
`server/src/generator`. Each client has a payment profile that shapes its
history: on time, late by a fixed lag, drifting later every month, short-paying
by an early-payment discount, batching several invoices into one transfer, or
citing the previous invoice on every remittance. The fixed simulated as-of date
is **September 15, 2026**. `server/src/generator/facts.ts` derives ground truth
from the ledger (aging, days to pay, late-payment rates), which the evals and
customer views read from.

The base ledger is built once per process and shared by every visitor. A
session stores only what its visitor changed: allocations, proposals and
operation results. Reset drops those and returns the visitor to the base.

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

The assistant answers through six read-only tools (`ledgerSummary`,
`monthlyTotals`, `aging`, `customerStatement`, `findRecords`,
`unappliedPayments`) that each return a small, shaped result, then composes
its answer from a component kit and hands prose plus components to `render`.
The server validates every component against the kit and every ID against the
session's snapshot before the UI reaches the browser; components carry IDs,
never amounts, and the React side resolves them against the application's own
snapshot. The kit is built by one shared helper (`createAssistantKit`) so the
server and the client always agree on its schema. That validated echo is the
assistant message the browser renders, so the middleware's `after` hook
suppresses the root model's own closing message, and ends the run with a
`RUN_ERROR` — the client's "could not finish" alert — when a turn produced no
validated UI at all.

Dashboard includes ledger-derived totals and monthly invoiced/received data.
Payments default to unmatched items; All payments includes historical receipts.
A selected payment remains visible after matching to preserve context. There
are no real transfers, collections workflows, or payment reminders.

The Pretable and B4 dependencies were explicitly requested and approved as part
of this example's design; the root Zod 4 migration was separately approved.

## Run locally

The server pins published `@b4run/cli`, `@b4run/langchain`, and `@b4run/sdk`
packages at **0.9.0** in its private npm workspace. A separate B4 checkout or
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
The server directory is itself the B4 app root, so the agent resolves the same
installed B4 packages as the server, regardless of npm hoisting. No dependency
points to a local B4 checkout.

## Evals

The assistant has an on-demand eval suite in
`server/src/app/assistant/evals/assistant.eval.ts`: nine questions whose
expected answers are computed from the generated ledger's facts at load time
(the unapplied USD total, the GBP client with the largest open balance, the
GBP client with the most over 90 days, Cedar Health's open invoice IDs, the
ambiguous Atlas payment, three payment habits), so the dataset can never
drift from the data the assistant queries. Scorers check that the model
renders exactly once, that no tool errored, that
the prose never claims to have allocated anything, that the answer is under
6,000 characters, that it answers the question (the right rows, customer,
chart, or habit), and an LLM judge grades the prose for formatted amounts,
no allocation claims, and no invented customers. The gate is a 0.8 pass
rate plus every scorer's threshold.

Three modes, all from the repository root:

```sh
npx nx run invoicing-server:eval                 # replay committed fixtures, no key
npx nx run invoicing-server:eval -- --live       # real model, fixtures untouched
npx nx run invoicing-server:eval -- --record     # real model, rewrite fixtures
```

`--live` and `--record` need `OPENAI_API_KEY`, or `INVOICING_ENV_FILE`
pointing at an env file that provides it, exactly as `serve` does. A trailing
argument filters by case name or by the eval file's basename
(`-- --record "habit summit"` re-records one case); `--json[=file]` also writes the reports as JSON. Fixtures are one
`assistant.<case>.fixtures.json` per case, next to the eval file, and are
committed: each holds every model call the case made, the LLM judge's
included, so replay needs no network and reproduces the record run's report.
The suite runs on demand, not in CI, by decision. Nothing scores the model's
closing message any more: the `after` hook in `server/src/middleware.ts`
decides it, suppressing it when the run validated UI through `render` and
failing the run when it did not. The eval harness calls the agent directly,
so `after` never runs there and `run.finalMessage` is the model's raw closing
message; the LLM judge is therefore shown the `render` prose, which is what
the user actually reads. With the closing-message instruction gone from the
prompt, gpt-5-mini ends a run saying nothing at all, and aimock rejects a
fixture whose `content` is the empty string, so `server/evals/fixtures.ts`
stores that recording as `{}` — inert here, since `after` replaces the
message in production and no scorer reads it.

`server/evals/harness.ts` wraps B4's `createAgentHarness` (which gained a
`middlewareContext` option in 0.9.0) with the context
`server/src/assistant-middleware.ts` would build for a fresh session on the
sample ledger (`assistantContext`, shared by both so they cannot drift), so
each case runs through the real agent, tools and `render` with no HTTP
server, session cookie or storage. Record mode chains a second aimock
behind the harness's own so each case's tape, the LLM judge's calls
included, is cut with the app's own fixture keying
(`server/evals/fixtures.ts`), which the harness's `getRecordedFixtures()`
would not replay for the nested `render` echo call.

## Deployment

`npx nx build invoicing` produces `examples/invoicing/.vercel/output`
(the B4 runtime function `b4.func`, the `api` function, and the SPA).
`b4 build` publishes that whole tree itself: `build.vercel` in
`server/b4.config.ts` names the static directory and its SPA fallback, the
`api` function and its entry, the `/api` route, and the runtime function's
`maxDuration`. Production is <https://invoicing.hashbrown.dev>, deployed by
`.github/workflows/deploy.yml`.

CI deploys prebuilt output, so `build.vercel.reconcileVercelJson` is `false`
and there is no committed `vercel.json`: Vercel would never run its
`buildCommand`. `build.vercel.maxDuration` gives the agent function a 300s
ceiling, since a review can stream for minutes; `bootstrap.mjs` reconciles the
fluid compute that allows it.

The Vercel project env has `OPENAI_API_KEY` and `DATABASE_URL`. `DATABASE_URL`
points at Neon, connected through the Vercel Marketplace integration; B4's
checkpoints and threads and the example's sessions live there. Locally,
`DATABASE_URL` is optional — the server falls back to memory repositories —
so `npx nx serve invoicing-server` needs no database.

`node tools/vercel/bootstrap.mjs --env-file <path> --skip-workflow`
provisions the project, domain, and secrets, and reports a missing
`DATABASE_URL` instead of failing.

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
persist together: sessions and B4 threads live in Postgres when `DATABASE_URL`
is set, and in process memory — which does start fresh on restart — otherwise.
Each allocation-review thread owns one immutable proposal; the read-only
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

Current verification: 147 unit/integration tests pass (105 server, 39 React,
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

Run the deterministic browser checks without model credentials (install the
Playwright Chromium browser first with `npx playwright install chromium`):

```sh
npx nx example-e2e invoicing-e2e
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

V1 scope is complete for the local example: seeded Dashboard/Payments, real-model
conversation, explicit simulated approvals, and operation-result verification.
Per-session state is durable: the Postgres repositories commit each session and
each thread by compare-and-swap, so a ledger outlives the process that created
it. There is no cleanup or TTL for stored sessions and threads yet, and
browser-refresh recovery remains out of scope — refreshing starts a new
conversation. Do not refresh during a pending approval in this V1 demo.
Deployment and retirement of older examples are separate follow-ups.
See `compatibility.md` for dated verification evidence.
