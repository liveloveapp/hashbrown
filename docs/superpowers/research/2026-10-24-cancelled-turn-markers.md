# Cancelled requests remain explicit in model history

Status: the user approved preserving cancelled requests with an explicit marker. Core implementation passed spec and quality review, 1,759 tests/87 suites/14 snapshots, build, lint and API reporting. Framework/native validation and release verification are tracked below. No new dependencies or public message variant were added.

## Why a shared history change

Before this follow-up, native v4 Stop cases verified old-session cancellation/destruction before fresh creation, no late old chunks, zero active readers and balanced sessions. The fresh authoritative history retained the cancelled counting USER request followed directly by a new lookup USER request. No unfinished assistant reply was retained, but the small model could resume the older instruction. This was model/context behavior, not stale stream output.

The selected policy preserves the exact original user message and adds a factual assistant-role runtime cancellation record after committed history. Explicit Stop records that the user stopped the request; superseding input records replacement by a new request and inserts before that exact replacement fragment. Existing tool settlement and rollback remain: completed rounds and cancelled-tool results survive, unfinished draft output and speculative state do not.

One ownership-checked transaction prepares canonical history and public projection. Repeated/stale/idle Stop, accepted final completion, disposal/thread retirement, retries and authoritative setMessages add no marker. The record is not a successful model reply, usage/result publication, error or extra request.

## Model input and rendering

Reserved versioned provenance (`hashbrown.runtimeCancellation`) identifies a runtime record in owned canonical history. Full, reconciled and streaming projections omit it from ordinary assistant messages and structured/UI parsing. The shared outgoing boundary preserves factual text and strips only that private key, keeping unrelated metadata. Native transports perform ordinary text/history translation without guessing which requests were cancelled.

A server may echo metadata-free history through MESSAGES_SNAPSHOT. Only an exact existing plain-text assistant ID/content match with no toolCalls regains locally owned provenance; text alone never identifies a marker. Changed content/role or added tool calls remain ordinary records. A snapshot omitting the marker remains authoritative deletion. Tests cover forged private metadata, ordinary/schema/UI/streaming projections and the outgoing-request/echo round trip.

## Verification evidence

- Focused root/projection/input/snapshot tests first failed for the missing transaction (`/tmp/cancel-core-red2.log`). Effect tests failed before implementation (`/tmp/cancel-effects-red.log`).
- Real React/Angular browser regressions both failed because the next request contained zero markers where one was required (`/tmp/hashbrown-cancellation-browser-red.log`). The original request was still present.
- Additional regressions caught idle-startup false cancellation (`/tmp/cancel-idle-red3.log`) and streaming projection of a metadata-free snapshot (`/tmp/cancel-snapshot-stream-red.log`) before fixes.
- Final core verification: `/tmp/cancel-core-tests-final2.log`, `/tmp/cancel-core-build-final.log`, `/tmp/cancel-core-lint-final.log`, `/tmp/cancel-core-api.log`. Lint has zero errors and three existing tool-step unused-variable warnings; existing API/build warnings remain visible.
- Dependent package/host build and lint passed (`/tmp/hashbrown-cancellation-packages-build-lint.log`). Dependent unit tests passed: React 204, Angular 272 and conformance 45 (`/tmp/hashbrown-cancellation-framework-unit.log`). The full standard browser suite passed all 72 cases, including the formerly failing next-request marker assertions (`/tmp/hashbrown-cancellation-standard-green.log`). Native results will be recorded only after completed runs.

This marker describes cancellation; it does not guarantee native model instruction-following or final-output formatting. Keep exact hidden-token assertions, cleanup assertions and marker-input assertions distinct. Do not strip JSON fences, rewrite receipts, or mask quality failures as expected successes. Local model suites remain opt-in, outside CI and sequential for GPU access; hardware item4 remains excluded.

## Native-tools baseline released

[PR #737](https://github.com/liveloveapp/hashbrown/pull/737) merged at
`d7d59dddd05e8b7b33c3efc0af5a1fe328fc8fa6` after exact-head CI
run 40117166309 passed. The reviewed head
`cb2d8a4bbd357ff4f2e965f8c056a8696c7eef07` and squash commit share tree
`6ee20c23bd52be0380e0966bace00375de4c0612`; the merge was verified on
origin/main. The recipe conflicts with main's recorded local-model guide were
resolved by retaining that guide and adding a separate native-tools disclosure.
The combined docs passed build, lint and all 830 tests. The baseline native
factory remains experimental and retains its strict live quality failures.

All 18 native aimock workflows passed with cancellation markers, no skips,
flakes or unexpected failures (`/tmp/hashbrown-cancellation-native-contracts.log`,
retained report `/tmp/hashbrown-cancellation-native-contracts-report.json`).
Both Stop cases recorded `cancellationHistoryVerified:true`, three sessions
created/destroyed and zero active readers. Review then strengthened the native
assertion from a prompt prefix to the complete original request; final focused
Stop and real-model runs use that stronger assertion. Final conformance build,
45 unit tests and lint passed after that change
(`/tmp/hashbrown-cancellation-conformance-final.log`).

## Real v4 Stop verification

The final focused installed-model run passed both Angular and React strict Stop
cases with the original counting request preserved exactly and one explicit
runtime cancellation marker before the new lookup. Each case executed exactly
one lookup and returned its exact hidden random token in native chunks and the
rendered answer. Both `cancellationHistoryVerified` and
`sourceBoundaryVerified` were true; each case balanced three created/destroyed
sessions, returned to zero active readers and recorded no page errors or HTTP
fallbacks. Full test durations were 56.6s (Angular) and 26.6s (React).

Command: `LOCAL_LLM_E2E=1 LOCAL_LLM_PROFILE=/tmp/hashbrown-native-tools-model-profile
npx nx local-native-tool-workflow-smoke conformance --excludeTaskDependencies
--grep='native Stop'`. Dependencies were already freshly built and verified;
the flag avoided redundant builds and did not change browser options or model
behavior. The local target still refused downloads and used the experimental
v4 flag bundle and dedicated profile. Evidence:
`/tmp/hashbrown-cancellation-v4-stop.log` and
`/tmp/hashbrown-cancellation-v4-stop-evidence/live-report.json`.

These are the two cases that previously resumed counting. The focused result
does not regrade the prior ten-case suite or promise general instruction
following. Prior receipt/token formatting failures remain retained historical
quality evidence; no output was normalized and no xfail was introduced. The
final strengthened aimock Stop cases also passed in both frameworks
(`/tmp/hashbrown-cancellation-stop-contract-final.log`).
