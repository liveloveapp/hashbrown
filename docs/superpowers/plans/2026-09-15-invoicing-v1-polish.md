# Invoicing V1 Manual QA Fixes

Use subagent-driven development for the independent UI task and review.

The user approved fixing the findings from manual Chrome use. Keep V1's
in-memory lifetime; no refresh recovery, persistence, or new dependencies.

- [ ] Capture real assistant protocol errors for the failed ledger question.
  Reproduce the cause with a failing server test, then make a bounded fix.
  Relevant code: server/src/app/assistant/tools/respond.ts,
  server/src/assistant-middleware.ts and assistant tool helpers/tests.
  Preserve server schema validation, read-only tools, and real model interaction.
- [x] Improve UI with failing React tests first: clear busy-match notices when
  work ends; show server/application-derived client names and record references
  on proposal cards without extending model props; collapse terminal review
  history with summaries while keeping old controls inert. Improve clipped
  payment-reference discoverability. Files: React App, AssistantWorkspace,
  ReviewChat, AllocationProposal, styles and their tests. No authority changes.
- [x] Review independently for scope and quality; run affected React build/test/lint plus e2e build/lint/example-e2e.
  Server and contracts remain unchanged. Adapt browser
  assertions to collapsed history when necessary without weakening financial
  assertions. Restart preview after server changes.
- [x] Repeat a ledger-total question and approval/decline flow with real models in
  Chrome; document evidence and remaining limitations. Commit coherent changes.

Next after these fixes: merge the follow-up once checks/review pass, then choose
hosting for the canonical demo. Legacy retirement requires deployment and
conformance inventory; it is not part of this polish change.

## Verification notes

- React: build, lint and all 39 tests passed. E2E: build, lint and all four
  deterministic browser scenarios passed. Independent review found no
  correctness issues. Build retains the existing >500 kB chunk warning.
- A direct real-model request using the earlier failed question succeeded in
  102.7 seconds with valid JSON UI and a successful terminal run event. This
  does not establish the cause of the earlier intermittent failures.
- During the follow-up Chrome check the local frontend was no longer listening
  on port 4326. Restarting it restored the preview. A fresh conversation
  correctly returned $9,500, reflecting prior simulated allocations.
- Chrome verified readable Harbor client/payment/invoice labels, busy-match
  guard, successful decline, automatic collapsed history, cleared busy notice,
  unlocked composer, and disabled old controls after reopening history.
- No speculative server change was made. Follow up on conversational latency
  and capture a failing request before changing protocol or context handling.
  The ledger tool currently includes all 299 invoice/payment records; profile
  context size and the nested UI-rendering model call as part of that work.
- Chrome also verified a fresh Harbor approval after the decline: $3,200
  applied, total unapplied cash changed from $9,500 to $6,300, Harbor retained
  $1,800, history collapsed as applied, and the composer unlocked.
- The updated live-model automated spec was typechecked/linted but not rerun;
  real-model verification above was performed manually in native Chrome.
