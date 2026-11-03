# Candidate action observation follows Angular rendering

Status: SPEC-approved narrow fixture correction. Original CI RED, deterministic actual-browser RED, controlled GREEN and all eight uninstrumented focused compositions are witnessed. Affected build/test/lint checks are active; complete372/current full-source CI, final fresh candidate qualification, merge and production verification remain PENDING. No product/helper/template change is included.

## Observed failure

In [CI 41564111866](https://github.com/liveloveapp/hashbrown/actions/runs/41564111866), source checkpoint [1fb7f7941df9ea20bf44350f6ec3aa3d6fcf3ade](https://github.com/liveloveapp/hashbrown/commit/1fb7f7941df9ea20bf44350f6ec3aa3d6fcf3ade), the cold matrix stopped at angular.openai.chat.chat.failure.ack-disconnect: 204 passed, one failed, 167 not run. The failure was an immediate rendered lastAction assertion after clicking the existing repeat-submission control.

Actual retained trace order: click dispatch 912454.267–912455.568; immediate status DOM read 912456.785–912457.978 still showed the preceding action and localError:null. No later status observation was retained at that point. This proves the immediate assertion did not observe the action publication; it does not prove that rendering eventually occurred.

CandidatePanel.repeatSubmission calls invoke exactly once. invoke synchronously updates actual lastAction/localError signals and invokes the real SDK with the identical options object retained from the preceding submission. statusJson is a computed signal rendered into a pre element; event dispatch completion does not guarantee that Angular's scheduled DOM refresh has completed. The resource/native refusal contracts are unchanged by this distinction.

## Proposed narrow correction

After the one existing button click, use one bounded poll that reads the same actual status observation and requires BOTH the exact expected lastAction and a nonempty actual localError. Only after that observation may the unchanged physical state, stage, provider/run, native witness and observer guards run. Preserve the pre-click baseline; never rebase it after waiting.

Do not retry the click, synthesize an error/action value, read a cached status as fresh, call SDK methods outside the existing control, change scheduling/product behavior, force change detection, extend timeouts, skip cases or loosen no-work counters. The existing candidate policy remains: 15-second configured assertion bound and 180-second case bound, workers1/retries0. The full372 manifest remains unchanged.

The same action/error observation is paired at the initial repeat-submit, the first negative-send immediately afterward, and each action in the post-authoritative-read refusal loop. The first negative-send previously polled error only, which could consume the preceding repeat-submit error before its own render. Waiting on error alone can consume a preceding action's retained error; separate reads can describe different renders. In the current failedAttempt sequence each action label differs from the preceding rendered action, including after the authoritative read. No new action epoch or SDK API is needed.

Before assertion, retain actual pre-click status, last polled status and the unchanged original work baseline if useful for diagnosis. These are observations, not authority or fabricated completion receipts.

## Deterministic browser probe plan

Use a fresh fully qualified packaged candidate and the real mounted Angular facade, PostgreSQL/native worker, provider fixture, observer and proxy. Reach the genuine ambiguous failure, source-proven native cleanup and retained original recovery submission using the existing scenario. Retain all existing actual no-work and native authority checks.

Preferred diagnostic seam: Playwright's browser clock, installed before navigation and paused only once the page is idle at the exact negative-action boundary, can hold the framework's next scheduled render frame. Dispatch exactly one real visible control click (with actionability handled without needing the paused frame). Read actual DOM status while the clock is held: it must retain the prior render rather than an invented value. Advance real scheduled browser callbacks by bounded virtual frame turns, then read the actual status until the exact action/error pair is visible. No application field, DOM text or SDK response may be overwritten.

This clock seam needs validation against the actual Angular scheduler: if it does not control the render callback, do not claim deterministic delay or add a production delay. Root may instead use an equivalent browser-owned frame gate that delays only actual scheduling and forwards the unchanged callback exactly once. The retained CI failure already supplies the meaningful integration RED; a probe's tooling failure or missing capability is not a second behavioral RED.

The probe must demonstrate:
1. The immediate old assertion can fail before actual rendered publication.
2. The same single click later produces the actual exact action plus genuine refusal error.
3. The proposed observation poll succeeds without any second command invocation, request/provider/handler/native work or physical mutation.
4. Omitting the action, observing an empty error or retaining only the previous action/error cannot satisfy the poll.
5. All owned browser/worker/proxy/observer cleanup still completes.

No mirror unit test that merely reimplements the polling expression is required. Root executed all eight actual focused ack-disconnect compositions after review and correction; full affected gates and future fresh-candidate qualification remain separate. Neither the focused subset nor the diagnostic probe qualifies the full372 matrix.

## Deterministic actual-browser RED witnessed

The root-run controlled browser probe failed the original immediate lastAction assertion as intended. It retained exactly one armed, trusted click and one deferred Angular RAF plus timer callback. Real immediate DOM reads at 839/859ms showed the prior resume action and null error; the native controlled release occurred at 1039.9ms. The later actual DOM observation at 1141.1ms showed negative-repeat-submit:resumeConversationRecovery and the real error, “Error: Stale or already claimed browser recovery batch.” Diagnostic, cleanup and postflight errors were empty. This proves delayed publication without a second SDK invocation or fabricated DOM values.

The authored correction polls one actual status object for the exact action/error pair at the three scoped sites, preserving all original beforeRepeat/afterRead work baselines and guards. Root freshly bound both candidates before the controlled GREEN and focused eight-composition execution described below.

## Completed narrow verification

The root-run controlled GREEN used the same 200ms scheduling gate, exactly one trusted click and two actual scheduler interceptions. It observed old DOM followed by the genuine refusal and passed the complete journey/no-work guards. Its diagnostic read-only MutationObserver captured publication without a later fixed-delay race against the next action.

The separate uninstrumented Playwright run passed all eight exact ack-disconnect composition IDs in 51.4 seconds, once each with zero skips/errors. All eight retained journey cleanup and no-work guards passed. This is focused coverage only. The original F2 cold CI remains FAILED at 204 passed / one failed / 167 not run; these focused results do not relabel it.

Full affected build/test/lint checks are active. Complete372 and current full-source CI acceptance, final new-commit candidate preparation/qualification, PR/merge and production verification remain PENDING. The current patch changes selected candidate source; no earlier candidate binding is reused as final qualification for a future commit.

## Affected-project verification

Root completed `npx nx build dotnet-conformance`, `npx nx test dotnet-conformance` (the full harness/runtime/package aggregate), and `npx nx lint dotnet-conformance` successfully. Build reported three successful tasks; test reported seven successful tasks, two cached; lint reported four successful tasks, two cached. The full test invocation took 12 minutes 45 seconds. Fresh complete browser qualification at the committed correction remains required.
