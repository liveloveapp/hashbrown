# Invoicing Example: Generative UI Read Path — Design

## Summary

The invoicing example exists to showcase Hashbrown's generative UI while
dog-fooding Pretable and B4. Today its read path does not show generative UI
at all: the assistant has two components with one string prop each, the
server builds the exact UI JSON and asks the model to echo it, and the only
data is a fixture in which 288 of 299 rows are identical retainer invoices
paid in full on the tenth. The model composes nothing and has nothing worth
composing.

This design replaces the fixture with a seeded, multi-currency ledger whose
clients have distinct payment behaviors; replaces the one dump tool with six
query-shaped tools; gives the assistant a six-component kit it composes
directly, validated server-side inside a `render` tool; and adds an on-demand
eval suite built on `@b4run/evals`, `@b4run/testing` and aimock, with ground
truth computed from the generator.

The write path (review agent, proposal, B4 approval, `applyAllocation`, thread
ownership, `review-coordinator.ts`) is unchanged.

Capability gaps in B4 found while doing this are recorded in
[Upstream findings](#upstream-findings) and filed against `cacheplane/b4run`,
not worked around silently.

## Goals

- The assistant composes UI from a kit in response to a question: a Pretable
  grid of rows it chose, a trend chart, an aging summary, a customer card,
  prose, and the existing hand-off to review. Composition is the model's;
  validation is the server's.
- The ledger has enough variety that questions like "who pays late", "which
  GBP client is furthest behind", "how did EUR invoicing trend this year"
  have real, computable answers.
- One question costs under 3K tokens of tool results, down from ~44K.
- Session state holds only what a visitor changed. The base ledger is shared.
- An eval suite with computed expected answers runs on demand: replay from
  committed fixtures with no key, or live against the real model.
- The five existing scenarios keep their IDs so current e2e and unit tests
  still pin them.

## Non-Goals

- Changing the write path in any way. No new mutations, no change to the
  approval flow, no change to `review-coordinator.ts`.
- Making cash-application matching the product. Remittance text stays
  simple; the five scripted ambiguities remain the matching showcase.
- Model evals in CI. Replay would be free and deterministic, but the suite is
  on demand by decision.
- A data migration. Existing Postgres sessions are read compatibly.
- Real-time data, imports, or an external accounting system.

## Trust model

Two paths, one direction of trust each.

**Read path, expressive.** The model calls query tools, chooses rows and
components, and composes a UI tree. The server checks that every component is
in the kit and every referenced ID exists in this session's snapshot before
anything reaches the client. Components carry IDs, never amounts. The React
side resolves IDs against the application's own snapshot, so every number a
user sees came from the server.

**Write path, strict.** Exactly as today. `ReviewPayment` hands off to the
review thread; the server prepares the proposal; B4 approval gates
`applyAllocation`. Nothing on the read path can reach it except by offering a
`ReviewPayment` for a payment that is genuinely unapplied.

## Architecture

### Base ledger

`server/src/generator/history.ts` builds the base ledger once per process from
a seed. It is immutable and shared by every session.

Inputs are a client table and a seed. Twelve clients across three currencies:

| Currency | Clients | Profiles represented                                                |
| -------- | ------- | ------------------------------------------------------------------- |
| USD      | 8       | on-time ×4, wrong-reference, late-drifting, late-fixed, short-payer |
| EUR      | 2       | on-time, batch-payer                                                |
| GBP      | 2       | late-drifting, short-payer                                          |

The six existing USD clients keep their IDs and names. The five scenario
clients settle every generated invoice by the as-of date (four `on-time`,
Atlas `wrong-reference`, which also pays on time): the review flows in the e2e
suite depend on a scenario invoice being the only outstanding candidate for
its payment. Juniper is `late-drifting`. Six new clients carry the remaining
profiles: two USD, two EUR, two GBP.

Profiles are data on the client record:

| Profile           | Behavior                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------- |
| `on-time`         | Pays each invoice in full 5 to 12 days after issue.                                           |
| `late-fixed`      | Pays in full, always 35 to 45 days after issue.                                               |
| `late-drifting`   | Days-to-pay grows month over month; the most recent invoices are open.                        |
| `short-payer`     | Deducts a 2% early-payment discount and pays within 10 days; the remainder stays outstanding. |
| `batch-payer`     | Settles two or three invoices in one transfer every second or third month.                    |
| `wrong-reference` | Pays on time but the remittance cites the previously issued invoice's number.                 |

Every client has a monthly retainer over 24 months (October 2024 to
September 2026) plus one to three project invoices per quarter at irregular
amounts. The as-of date is September 15, 2026. Invoices issued after the
profile's expected payment lag and not yet paid are open; that is where aging
comes from.

The five named scenarios (`exact`, `partial`, `combined`, `ambiguous`,
`advance`) are appended verbatim with their existing IDs, references, dates
and amounts, so `sampleScenarios` and everything pinned to it keeps working.

The generator uses a small seeded PRNG (mulberry32 or equivalent, inlined, no
dependency). Same seed, same ledger, byte for byte. The default seed is fixed
and documented; tests may pass another.

### Ground truth

`server/src/generator/facts.ts` derives a facts object from the generated
ledger:

- per client: profile, currency, average days to pay, late-payment rate,
  total invoiced, total received, open balance, unapplied cash
- per currency: totals, largest overdue balance and which client holds it,
  aging buckets
- the set of ambiguous unapplied payments (more than one candidate invoice)

Facts are pure functions of the ledger. The `CustomerCard` tool result and
the eval dataset both read from them, so an eval's expected answer is never
typed by hand.

### Session overlay

The session document loses its `ledger` field. It holds:

```ts
interface Session {
  readonly generation: number;
  readonly allocations: readonly Allocation[];
  readonly activities: readonly Activity[];
  readonly proposals: Record<string, Proposal>;
  readonly operations: Record<string, { request; result }>;
}
```

`LedgerSnapshot` gains `customers` (id, name, currency, profile) from the base
ledger's client table. `getSnapshot(base, overlay)` merges base allocations with overlay allocations
before deriving `unappliedCents` and `outstandingCents`. `applyProposal`
appends to the overlay. `reset` clears the overlay and bumps the generation.
`createSessionStore` takes the base ledger instead of a factory.

Existing Postgres rows contain a `ledger` key and no `allocations` key. A row
written under the old shape (it carries a `ledger` key) reads as an empty
overlay one generation later, which invalidates its old proposals through the
existing stale-generation path and drops the key on the next commit. No
migration.
The schema note in `persistence/schema.ts` about `CREATE TABLE IF NOT EXISTS`
still applies to any new column; this change adds none.

### Query tools

All tools read the session snapshot through the assistant middleware context,
as `readLedger` does today. Every amount is returned twice: integer cents and
a formatted string with currency, so the model never divides. Every tool
result is a small object; none returns the whole ledger.

| Tool                | Input                                                                                                                                             | Returns                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `ledgerSummary`     | none                                                                                                                                              | as-of date; per-currency totals; counts of open invoices and unapplied payments; customers with id, name, currency, profile label |
| `monthlyTotals`     | `currency`, `customerId?`, `months?` (default 12, max 24)                                                                                         | rows of month, invoiced, received                                                                                                 |
| `aging`             | `currency`, `customerId?`                                                                                                                         | buckets current, 1-30, 31-60, 61-90, 90+ with totals and invoice IDs                                                              |
| `customerStatement` | `customerId`                                                                                                                                      | profile, totals, open invoices, unapplied payments, average days to pay, last payment                                             |
| `findRecords`       | `kind?` (invoice/payment), `customerId?`, `currency?`, `status?` (open/settled/unapplied), `text?`, `from?`, `to?`, `limit?` (default 20, max 50) | matching IDs with one summary line each and a total count                                                                         |
| `unappliedPayments` | `currency?`                                                                                                                                       | each unapplied payment with candidate invoices for the same customer and currency                                                 |

`readLedger` is deleted. The system prompt no longer instructs a tool call per
turn; it describes the tools and tells the model to call `render` once as its
last action.

### Kit

Contracts live in `shared/src/assistant-contract.ts`, consumed by the server
response schema and the React `exposeComponent` calls, as today.

| Component       | Props                               | Children | Server validation                                                    |
| --------------- | ----------------------------------- | -------- | -------------------------------------------------------------------- |
| `AssistantText` | `text`                              | yes      | none                                                                 |
| `LedgerTable`   | `title`, `recordIds: string[]`      | no       | every ID is an invoice or payment in the snapshot; 1 to 50 IDs       |
| `TrendChart`    | `currency`, `customerId?`, `months` | no       | currency present in ledger; customer exists if given; months 3 to 24 |
| `AgingSummary`  | `currency`, `customerId?`           | no       | as above                                                             |
| `CustomerCard`  | `customerId`                        | no       | customer exists                                                      |
| `ReviewPayment` | `paymentId`                         | no       | payment exists and is unapplied (today's `validatePayment`)          |

`TrendChart` and `AgingSummary` deliberately carry no data. The React side
computes their series from the snapshot so a chart can never plot a number
the model typed.

### Render tool

`render({ ui })` is the assistant's only way to put UI in front of the user.

1. Validate `ui` against the kit JSON schema. Reject unknown components,
   unknown props, and children on leaf components.
2. Walk the tree and resolve every `recordIds`, `customerId`, `paymentId` and
   `currency` against the session snapshot. Reject on any miss with an error
   naming the offending ID so the model can correct and retry once.
3. Stream the validated tree through the existing nested structured-output
   call, exactly as `respond` does today, and deep-equal the echo.

`respond` is deleted. The system prompt tells the model to call `render`
exactly once as its last action. If the model emitted UI in its final text
instead of through `render`, Hashbrown would render it without the server's
ledger checks.

This was originally a prompt-level contract — "output exactly `{"ui":[]}`"
after `render`, with an eval scorer on it — because B4 had no server-side
seam for the final message. Since 0.9.0 the middleware's `after` hook
(finding 5) decides it instead: the closing message is suppressed when the
run validated UI through `render`, and the run is rejected, surfacing the
client's error alert, when it validated none. The prompt no longer mentions
a closing message. See [Upstream findings](#upstream-findings).

### React

`assistant-workspace.tsx` exposes all six components. The snapshot moves from
props into a context so kit components read it without prop threading.

- `LedgerTable` wraps `PretableSurface` with the payment column set `App.tsx`
  already defines, plus an invoice column set extracted alongside it. Rows are
  resolved from the snapshot by ID. Missing IDs render nothing; if any were
  missing a one-line note says how many.
- `TrendChart` and `AgingSummary` compute their series from the snapshot with
  helpers shared with the Dashboard. Rendered as inline SVG, no new charting
  dependency. The dataviz skill is loaded when implementing.
- `CustomerCard` is a plain card reading the customer's rows and profile
  from the snapshot. `LedgerSnapshot` gains a `customers` array of id, name,
  currency and profile, served by `/api/snapshot` like everything else.
- `AssistantText` and `ReviewPayment` are unchanged apart from `AssistantText`
  accepting children.

### Evals

Eval files live at `server/src/app/assistant/evals/*.eval.ts` and use
`defineEval` from `@b4run/evals` with fixtures from `@b4run/testing`. They run
with `b4 eval` in three modes: replay from committed fixtures with no key,
`--live` against the real model, and `--record` to refresh fixtures. The
README documents all three. The suite is on demand, not in CI.

**Runner.** B4's `createAgentHarness` did not run route middleware at
0.8.36, so the assistant tools would have had no context. The example
shipped its own `runCase` until the upstream option landed: it started the
Hono app against an aimock instance, created a session cookie, posted the
AG-UI request for the case's input, collected the stream into an
`AgentRunResult`, and handed it to `runEval`. With B4 0.9.0 that runner is
gone: `server/evals/harness.ts` wraps `createAgentHarness` with the
`middlewareContext` the route middleware would have built (shared
`assistantContext`), and `run.ts` hands its result to `runEval`. Same eval
files, same scorers.

**Dataset.** Around fifteen cases, generated at eval-load time from the facts
object so expected values are computed:

- one per profile: "how does `<client>` pay?" expects `customerStatement`
  called and a `CustomerCard`, and the profile named in the text
- "which `<currency>` client is furthest behind?" expects the computed client
  ID in the render tree
- "show `<client>`'s open invoices" expects a `LedgerTable` whose `recordIds`
  equal the computed open set
- "how did invoicing trend this year in `<currency>`?" expects a
  `TrendChart` with that currency
- "match the Atlas payment" expects no allocation claim in the text, a
  `ReviewPayment` for the ambiguous payment, and no invoice chosen
- "what is unapplied right now?" expects `unappliedPayments` called and a
  `LedgerTable` of the five scenario payments

**Scorers.** `toolCalled` for routing; `custom` scorers that read the
`render` argument for component choice and ID sets; `tokensUnder` for the
context budget; `llmJudge` on grounding for free-text cases, replayed
from fixtures like everything else. (The scorer that graded the closing
message was removed once the `after` hook took over that contract.)

## Upstream findings

Filed against `cacheplane/b4run` during implementation. Small ones get a PR.

1. **`createAgentHarness` runs no route middleware.** Add a `middlewareContext`
   option threaded to `streamResolvedRoute`, which already accepts one. Blocks
   `b4 eval` for any app whose tools depend on middleware. Small. Fixed in
   0.9.0 (#756); the example's own runner was removed.
2. **Client `responseSchema` is accepted and ignored.** Hashbrown sends
   `hashbrown.responseSchema`; nothing in B4 reads it. Either apply it as the
   root model's response format or reject it, as #740 does for `tools`. Fixed
   in 0.9.0 (#758): applied as a strict `json_schema` response format in
   production; the eval harness does not send it.
3. **Tool schema derivation ignores the app's `tsconfig` paths.** B4's
   compiler builds its own TypeScript program without `paths`, so a tool
   whose input type is imported through a path alias (`@invoicing/contracts`)
   derives an empty schema, `{ properties: {} }`, and `b4 typegen` reports
   success. Two fixes: read the app's tsconfig when building the program,
   and fail loudly when an input type resolves to `any`. The example worked
   around it with a relative import in `render.ts` and a regression test on
   the derived schema. Fixed in 0.9.0 (#759); the alias import is back and
   the regression test stays.
4. **A thrown tool error never reaches the AG-UI stream.** The LangChain
   adapter emits nothing on `on_tool_error`, and only `on_tool_end` produces
   a `tool_result` chunk, so a client sees `TOOL_CALL_START`, `ARGS` and
   `END` for a failing tool and never a `TOOL_CALL_RESULT`; the failure is
   visible only inside `RUN_FINISHED.result.messages`. Found while building
   the eval harness, which backfilled results from there. Emit a
   `TOOL_CALL_RESULT` carrying the error `ToolMessage`. Fixed in 0.9.0
   (#757); the backfill (`collect-run.ts`) was deleted.
5. **No post-run hook on the final assistant message.** The only server-side
   validation seam is a tool, which is why `render` exists. A
   `middleware.after` or output guard would let a read path validate composed
   UI without the tool detour. 0.9.0 ships an `after` hook, and the example
   adopted it: the hook, not the prompt, now decides the assistant's closing
   message. The `render` detour stays, because its echo is what the browser
   renders.

## Delivery

Four pull requests, each green on its own, in order.

1. **Ledger generator, facts, base/overlay store.** New `generator/` module;
   `sample-ledger.ts` reduced to the client table and the five scenarios;
   session store and `getSnapshot` take base plus overlay; Postgres loader
   tolerates old rows. Tests: generator determinism, one test per profile
   asserting its facts, store tests updated, contract tests for both
   repositories, Postgres lane against the local container. Existing e2e
   unchanged.
2. **Query tools, kit contracts, render tool.** Six tools and `render` replace
   `readLedger` and `respond`; new contracts; assistant middleware context and
   system prompt updated. Tests: each tool against the generated ledger;
   render rejecting unknown components, unknown IDs, and applied payments;
   token budget asserted on every tool result. Verified on a Vercel preview,
   not only locally.
3. **React kit.** Six components, snapshot context, shared chart helpers.
   Tests: component tests for each; e2e updated for the new kit; deterministic
   Playwright config re-recorded where it pins assistant output.
4. **Evals and runner.** Eval files, dataset generation from facts, custom
   `runCase`, fixtures recorded once and replay verified. README documents
   `b4 eval`, `--live`, `--record`. The B4 findings in
   `docs/superpowers/upstream/2026-09-19-b4-findings.md` were filed as
   cacheplane/b4run#751 to #755 on 2026-09-19. PR 4 shipped its own harness (`server/evals/harness.ts`)
   because `createAgentHarness` ran no route middleware, so the assistant's
   tools would have had no ledger context. B4 0.9.0 added the
   `middlewareContext` option, and a follow-up PR replaced that harness with
   a wrapper over `createAgentHarness`.

## Open items carried, not changed

- `review-coordinator.ts` at 347 lines: untouched; revisit after B4 grants.
- `operationId` replay protection stays app-side, per the #738 appendix.
