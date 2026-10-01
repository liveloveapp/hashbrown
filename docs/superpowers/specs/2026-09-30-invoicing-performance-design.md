# Invoicing example: performance

**Status:** approved design, 2026-09-30.
**Scope:** `examples/invoicing` (React app, B4 server, e2e).
**Constraint:** the example must read like a real application. The server owns
the ledger, every assistant tool reads it server-side, and allocations are
server-authorised and applied exactly once after a human approval. Nothing in
this design moves data or authority into the browser.

## Why

Measured on 2026-09-30:

| Moment                  | What the user waits for                                                        | Measured                                 |
| ----------------------- | ------------------------------------------------------------------------------ | ---------------------------------------- |
| First load              | `/api/snapshot`, which starts only after the app script has downloaded and run | ~1.4 s on a first visit, 140–260 ms warm |
| Asking a question       | Several model turns (tool calls, then the answer) before any text              | 12–20 s                                  |
| Review match / Match to | Three model turns plus a nested model call that echoes a fixed card            | ~12 s to the approval card               |
| Approve                 | One more model turn after the allocation is applied, to output `{"ui":[]}`     | ~9 s                                     |

Sources: first load and snapshot timings from `invoicing.hashbrown.dev`
(Resource Timing, then three warm fetches); assistant and review timings from
the walkthrough recordings against the live model (2026-09-25, 2026-09-30).

Supporting facts:

- The ledger is generated from a fixed seed in ~10 ms; the snapshot is 470 KB
  of JSON, 29 KB gzipped. The size is not the problem; the round trip and when
  it starts are.
- The app ships one 1,040 KB script (289 KB gzipped). By unminified source:
  `@pretable/react` + `@pretable/core` ~1.35 MB, `react-dom` ~0.53 MB, the
  Hashbrown packages ~0.5 MB, `@ag-ui/client` + `@ag-ui/core` ~0.41 MB, the
  app itself ~0.14 MB. The grids need Pretable to paint; the assistant runtime
  (Hashbrown, AG-UI, the JSON stream parser, `fast-json-patch`) does not.
- The review agent (`server/src/app/review/index.ts`) runs: `readPayment` →
  `prepareAllocation`, whose tool body makes a nested `gpt-5-mini` call only to
  echo `{"ui":[{"AllocationProposal":{"props":{"proposalId":…}}}]}` →
  `applyAllocation`, which B4 pauses for approval → a last turn that outputs
  `{"ui":[]}`.
- B4 agents accept `reasoning: { effort }` (`none`…`xhigh`); both agents run at
  the model's default today.

## Decisions

| Question               | Decision                                                                                  | Rejected                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Where the ledger lives | Server, as today; the browser prefetches it earlier                                       | Generating or keeping the ledger in the browser (not real-world)                   |
| Scope                  | First load, review and approval, and question latency, as one spec delivered in three PRs | Any one area alone                                                                 |
| Review flow            | Keep the B4 agent and its approval interrupt; remove wasted turns                         | Calling REST endpoints with no model (fast, but stops showing B4's human approval) |
| Question latency       | Tune with evidence on the same model, gated by the live evals                             | Switching models; perceived-speed changes only                                     |

## 1. Measurement

Every later change is judged against numbers taken the same way.

- **Server-Timing.** `/api/snapshot` and the `/agui/*` routes send a
  `Server-Timing` header splitting session lookup, Postgres, and snapshot
  building (`session;dur=…, db;dur=…, snapshot;dur=…`). It is visible in
  browser devtools and readable from Playwright.
- **Per-turn timing.** Assistant and review runs log one structured line per
  model turn and per tool call (name, start offset, duration) through the
  existing middleware `after` hook or a B4 run hook, with run id and route.
  Locally it prints; on Vercel it lands in the function logs.
- **A performance script.** A Playwright script under `examples/invoicing/e2e`
  (Nx target `perf-live` on `invoicing-e2e`, using the live model like
  `live-model`) runs a fixed scenario five times and prints medians:
  - time from navigation to the first dashboard data;
  - for three fixed questions, time to the first answer text and to the
    settled answer;
  - for the Harbor combined payment, time from **Review match** to the
    approval card, and from **Approve and apply** to applied.

  It can target a local stack or a deployed URL. The first run, before any
  change, is recorded in this spec as the baseline, and each PR description
  reports the same table.

## 2. First load

- **Prefetch the ledger.** `react/index.html` gets a small inline module that
  starts `fetch('/api/snapshot', { credentials: 'same-origin' })` before the app
  script loads and parks the promise on `window`. `createSnapshotLoader`
  consumes that promise first and fetches only when it is absent (tests, other
  hosts). The server's time then overlaps the script's download and parse
  instead of following them. Errors follow the existing path (the "Unable to
  load the ledger" alert).
- **Load the assistant in parallel.** `AssistantWorkspace` and everything only
  it imports (Hashbrown, AG-UI, the review chat) load through `React.lazy`. The
  rail renders its heading, context summary and starter questions at once from
  a light shell; the starters and composer become active when the chunk
  arrives, and a starter clicked earlier is sent on arrival. The dashboard
  paints without waiting for the assistant chunk.
- **Cold first visit, from evidence.** The ~1.4 s first visit is investigated
  with the Server-Timing split before anything changes. Likely candidates:
  session creation in Postgres, connection setup, or the function cold start;
  each has a different fix (one transaction, connection reuse across
  invocations, region alignment). The fix is chosen from the numbers and
  recorded in the PR.

## 3. Review and approval

Same agent, same approval interrupt, fewer model calls.

- **Card from the tool result.** `prepareAllocation` returns the prepared
  proposal (id and lines) as its tool result, and the page renders the
  `AllocationProposal` card from that validated server tool call, the way
  answers render from the `render` tool through `serverToolCalls`. The nested
  model call and its structured-output plumbing go.
- **No separate read.** The selected payment and invoices already arrive in the
  validated run state (`selectedPaymentId`, `selectedInvoiceIds`), so
  `prepareAllocation` reads them server-side and the `readPayment` tool and
  turn go.
- **End on apply.** `applyAllocation` ends the run when it succeeds (B4's
  end-on-success, as `render` does), so the final `{"ui":[]}` turn goes. On
  decline or failure the run ends as today.
- **Minimal reasoning.** The review agent runs at `reasoning.effort:
'minimal'`: it follows a fixed procedure with no judgement.

The run becomes two short model turns: one calls `prepareAllocation`, the next
calls `applyAllocation`, which B4 pauses for approval. Exactly-once apply,
version checks and the operation-result reconciliation are unchanged. The
deterministic e2e (`workflow.spec.ts`) keeps covering failed reviews and lost
approval responses; its recorded fixtures are re-recorded for the new turn
sequence.

## 4. Asking questions

- **Reasoning effort, by evidence.** The assistant agent tries
  `reasoning.effort` `low`, then `minimal`, measuring with the performance
  script and running the live evals (`npx nx eval invoicing-server -- --live`) at each
  step. It ships the lowest setting at which the eval gate passes as it does
  today; known flaky cases (cedar, eur, habit, ~10%) are judged over three runs.
- **Skip the opening tool call.** The ledger summary (what `ledgerSummary`
  returns) and the current focus are supplied to the model at the start of the
  run, so it does not spend a turn calling `ledgerSummary`. This requires B4 to
  accept per-run context (for example a middleware-supplied message); if it
  does not, the tool stays and this item is dropped. The tool remains available
  either way.
- **Parallel tool calls.** Where B4 and the model allow it, independent query
  tools are called in one turn. The prompt already permits several tool calls;
  this is a model-call setting
  (OpenAI's `parallel_tool_calls`), enabled if B4 passes it through, not a
  prompt change.

## Targets

Measured by the performance script against the deployed app, medians of five
runs:

| Moment                      | Today                       | Target                            |
| --------------------------- | --------------------------- | --------------------------------- |
| Dashboard data, warm        | ~0.4–0.6 s after navigation | under 0.4 s                       |
| Dashboard data, first visit | ~1.8 s after navigation     | set after the Server-Timing split |
| Approval card               | ~12 s                       | under 5 s                         |
| Approve to applied          | ~9 s                        | under 1 s                         |
| First answer text           | 12–20 s                     | under 8 s                         |

A target missed after its PR's best effort is recorded with the measured
number and the reason, not silently dropped.

## Baseline

Measured 2026-10-01 against production (`main` at 02ccaff3) with
`PERF_BASE_URL=https://invoicing.hashbrown.dev PERF_RUNS=5 npx nx perf-live invoicing-e2e`;
medians of five fresh sessions:

| Moment                                                             | Baseline |
| ------------------------------------------------------------------ | -------- |
| Dashboard data                                                     | 0.51 s   |
| First answer text: How much cash is still unapplied?               | 11.20 s  |
| Settled answer: How much cash is still unapplied?                  | 13.00 s  |
| First answer text: Which clients pay late?                         | 11.64 s  |
| Settled answer: Which clients pay late?                            | 12.94 s  |
| First answer text: How did invoicing trend over the last 6 months? | 9.16 s   |
| Settled answer: How did invoicing trend over the last 6 months?    | 11.45 s  |
| Approval card                                                      | 7.60 s   |
| Approve to applied                                                 | 6.63 s   |

The earlier figures in "Why" (approval card ~12 s, Approve ~9 s) came from
walkthrough recordings; these replace them as the reference.

## Delivery

1. **Measurement and first load.** Server-Timing, per-turn logging, the
   performance script and its baseline; ledger prefetch; lazy assistant;
   the cold-start fix if the split shows a cheap one.
2. **Review and approval.** Card from the tool result, no `readPayment`, end on
   apply, minimal reasoning; re-recorded review fixtures.
3. **Question latency.** Reasoning effort by evals, up-front ledger summary if
   B4 allows it, parallel tool calls.

Each PR reports the performance table before and after.

## Testing

- Unit: `createSnapshotLoader` uses the prefetched promise and falls back to
  fetching; the lazy rail shell renders starters and queues a starter clicked
  before the chunk loads; the server-timing helper; `prepareAllocation`
  returning the proposal without a model; the review run ending on apply.
- Existing suites stay green on every PR: build, test and lint for
  invoicing-contracts, invoicing-server, invoicing-react and invoicing-e2e;
  the deterministic browser suite; eval replay.
- PR 3 additionally runs the live evals at each reasoning setting it tries.

## Out of scope

Moving the ledger or allocations into the browser; replacing the review agent
with REST endpoints; switching models; reducing Pretable or React DOM
themselves; CDN or hosting changes beyond what the cold-start evidence calls
for.
