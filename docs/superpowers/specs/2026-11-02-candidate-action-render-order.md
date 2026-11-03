# Candidate action observation follows Angular rendering

Status: The original narrow correction passed controlled and eight-composition verification. The follow-up private journey helper passed both controlled probes and 32 focused cases; all 24 special-mapping cases also passed and common-helper full affected gates passed. Complete 372/final qualification, merge and production verification remain PENDING. No SDK or template change is included.

## Observed failure

In [CI 41564111866](https://github.com/liveloveapp/hashbrown/actions/runs/41564111866), source checkpoint [1fb7f7941df9ea20bf44350f6ec3aa3d6fcf3ade](https://github.com/liveloveapp/hashbrown/commit/1fb7f7941df9ea20bf44350f6ec3aa3d6fcf3ade), the cold matrix stopped at angular.openai.chat.chat.failure.ack-disconnect: 204 passed, one failed, 167 not run. The failure was an immediate rendered lastAction assertion after clicking the existing repeat-submission control.

Actual retained trace order: click dispatch 912454.267–912455.568; immediate status DOM read 912456.785–912457.978 still showed the preceding action and localError:null. No later status observation was retained at that point. This proves the immediate assertion did not observe the action publication; it does not prove that rendering eventually occurred.

CandidatePanel.repeatSubmission calls invoke exactly once. invoke synchronously updates actual lastAction/localError signals and invokes the real SDK with the identical options object retained from the preceding submission. statusJson is a computed signal rendered into a pre element; event dispatch completion does not guarantee that Angular's scheduled DOM refresh has completed. The resource/native refusal contracts are unchanged by this distinction.

## Proposed narrow correction

After the one existing button click, use one bounded poll that reads the same actual status observation and requires BOTH the exact expected lastAction and a nonempty actual localError. Only after that observation may the unchanged physical state, stage, provider/run, native witness and observer guards run. Preserve the pre-click baseline; never rebase it after waiting.

Do not retry the click, synthesize an error/action value, read a cached status as fresh, call SDK methods outside the existing control, change scheduling/product behavior, force change detection, extend timeouts, skip cases or loosen no-work counters. The existing candidate policy remains: 15-second configured assertion bound and 180-second case bound, workers1/retries0. The full 372 manifest remains unchanged.

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

No mirror unit test that merely reimplements the polling expression is required. Root executed all eight actual focused ack-disconnect compositions after review and correction; full affected gates and future fresh-candidate qualification remain separate. Neither the focused subset nor the diagnostic probe qualifies the full 372 matrix.

## Deterministic actual-browser RED witnessed

The root-run controlled browser probe failed the original immediate lastAction assertion as intended. It retained exactly one armed, trusted click and one deferred Angular RAF plus timer callback. Real immediate DOM reads at 839/859ms showed the prior resume action and null error; the native controlled release occurred at 1039.9ms. The later actual DOM observation at 1141.1ms showed negative-repeat-submit:resumeConversationRecovery and the real error, “Error: Stale or already claimed browser recovery batch.” Diagnostic, cleanup and postflight errors were empty. This proves delayed publication without a second SDK invocation or fabricated DOM values.

The authored correction polls one actual status object for the exact action/error pair at the three scoped sites, preserving all original beforeRepeat/afterRead work baselines and guards. Root freshly bound both candidates before the controlled GREEN and focused eight-composition execution described below.

## Completed narrow verification

The root-run controlled GREEN used the same 200ms scheduling gate, exactly one trusted click and two actual scheduler interceptions. It observed old DOM followed by the genuine refusal and passed the complete journey/no-work guards. Its diagnostic read-only MutationObserver captured publication without a later fixed-delay race against the next action.

The separate uninstrumented Playwright run passed all eight exact ack-disconnect composition IDs in 51.4 seconds, once each with zero skips/errors. All eight retained journey cleanup and no-work guards passed. This is focused coverage only. The original F2 cold CI remains FAILED at 204 passed / one failed / 167 not run; these focused results do not relabel it.

The original correction subsequently passed affected build/test/lint and serial precommit before its commit. That historical checkpoint did not establish complete 372 acceptance. The follow-up changes selected candidate source; no earlier candidate binding is reused as final qualification for a future commit.

## Affected-project verification

Root completed `npx nx build dotnet-conformance`, `npx nx test dotnet-conformance` (the full harness/runtime/package aggregate), and `npx nx lint dotnet-conformance` successfully. Build reported three successful tasks; test reported seven successful tasks, two cached; lint reported four successful tasks, two cached. The full test invocation took 12 minutes 45 seconds. Fresh complete browser qualification at the committed correction remains required.

## Follow-up: close every local-refusal observation site

Status: SPEC-approved follow-up helper and five caller-site changes. Both controlled probes and 32 uninstrumented focused cases passed. The additional disjoint 24-case special-mapping run passed; common-helper full affected gates passed; the supplemental Busy fence local verification passed; full 372 qualification remains PENDING. The earlier three-site correction and its actual controlled/focused GREEN remain valid within their scope.

F3 [CI 41578697338](https://github.com/liveloveapp/hashbrown/actions/runs/41578697338), source [5675a90a590da16a10fdad438b3eba4cd50d91da](https://github.com/liveloveapp/hashbrown/commit/5675a90a590da16a10fdad438b3eba4cd50d91da), stopped at angular.openai.chat.chat.server.unknown-effect.dispatch-marker-committed: cold 220 passed, one failed, 151 not run. The remaining UnknownEffect refusal loop directly asserted lastAction after its click. Actual click completion was 924130.478; status read 924131.465–924132.734 still contained lastAction:read and localError:null. No later observation was retained. Native UnknownEffect 200/no snapshot/revision 10, unchanged two runs/one provider and clean page/cleanup/unexpected-request facts had passed before that assertion. Those facts do not prove eventual rendering or complete matrix success.

Source review also found generic localNegative polling localError OR resource error without binding it to the just-clicked action. In the five-command mutation sequence, a previous refusal's error could satisfy that condition. That is a false-positive risk as well as the direct-read false failure.

### Proposed common observation seam

The authored correction adds one private TSDoc-documented expectLocalRefusal(journey,page,expectedAction) helper in the existing candidate journey module. It performs only a bounded assertion poll, reading one fresh actual status per attempt and comparing exactly {lastAction:expectedAction,hasLocalError:true}. It neither clicks nor mutates/returns an invented public state, and it does not accept an unrelated resource error as the command's local refusal.

Callers retain their existing single clicks and original pre-action work/pending/witness baselines. Reuse the helper at the three already-correct paired sites, the remaining two-action UnknownEffect loop, and generic localNegative. Exact generic control-to-action mapping is:

- negative-stale-token → negative-stale;
- negative-incomplete-outcomes → negative-outcomes;
- negative-incomplete-decisions → negative-decisions;
- named mutation controls retain their actual identical action labels.

All unchanged snapshot/stage/native witness/provider/run/observer guards remain after the confirmed action/error observation; no baseline rebasing, extra invocation, handler dispatch, wait tolerance or timeout/retry policy change is allowed. The five-command mutation sequence must observe each new label, not merely reuse its predecessor's nonempty error.

Explicitly exclude authoritative reads, blocked read status/error observation, configuration-effect ErrorHandler observation and definitive HTTP 413 handling: those have separate HTTP/resource/effect contracts and must not be relabeled local synchronous refusal.

### Verification and retained recipe boundary

Root reproduced the actual UnknownEffect failure using a fresh F3-bound pair and the existing one-click scheduler-delay technique before authorizing the helper. Both controlled probes subsequently passed against freshly bound changed candidates, and the uninstrumented 32-case run retained all no-work guards. The generic controlled multi-action sequence proved each new label/error was actually observed; disjoint mapping coverage subsequently passed. A mock expression test alone does not verify actual Angular publication.

The helper lives in tools/conformance/dotnet/harness/candidate-browser-journeys.ts. Read-only inspection of qualify.mjs isSourcePath and the actual 44-entry capture sourceInputs shows no tools/conformance/dotnet paths; this helper and this specification are outside those bounded recipe inputs. The workflow and all 44 inputs remain untouched, so E3 is expected to remain valid. Root must verify the actual retained hashes/pin rather than merely infer validity from an unchanged count. No recipe pin rewrite or hash-only recapture is proposed.

### Follow-up actual RED evidence

The controlled UnknownEffect probe failed the original direct action assertion: expected the repeat-submit action but observed read. It retained one trusted click, one RAF plus one timer interception, actual old read/null DOM at 5112ms, then the genuine repeat-submit/refusal publication at 5302ms. Diagnostic errors were empty; postflight retained only the expected test failure. No second command was used.

A separate generic freshness probe first completed the unchanged original journey successfully, with no journey, page or cleanup failure. Its stricter observation audit then failed: five trusted controls had been clicked, but the old error-only guard advanced during the second/third gates while DOM still showed negative-send and its real preceding error. Actual publications for negative-resume/generate were absent before the later config action replaced the display. This is a measured false-positive in the old observation contract, not a product authority failure.

The implementation retains exactly one click at each existing caller and all original snapshots, pending comparisons, witness arrays, observer invariants and transport/read contracts. It shares only the configured-bound same-status action/localError poll. Controlled GREEN and the 32-case selected run passed as recorded below. Additional mapping coverage passed; common-helper full affected gates passed; complete 372 remains pending.

### Follow-up completed controlled and focused verification

Both root-run controlled probes passed against helper source SHA256 3753b88e913dd024dd1ed761c86b39905fbc96e1b447f530556b90461c9a98e9. UnknownEffect used one trusted click/two actual scheduler interceptions and completed in 21.0s. The five-action sequence used five trusted controls/ten interceptions, observed each current action with its genuine error, and completed in 54.5s. All original native/no-work/cleanup guards and post-qualification checks passed.

The separate uninstrumented 32-case run exited 0 in 7.3 minutes: exactly 32 unique cases once each, zero skips/errors, all eight compositions, with every original journey guard preserved. The disjoint 24-case run (three special-mapping scenarios across eight compositions) subsequently passed as recorded below. Common-helper full affected gates subsequently passed, and the full 372 result is still unqualified.

The F3 source-browser job separately completed in 30m28s: all 664 exact discovered cases once each, zero skips/flaky outcomes, with outcome inventory and downloaded artifact digest independently verified. That is a successful source-job domain only. F3 workflow/cold failure remains preserved at 220 passed / one failed / 151 not run; these controlled/focused passes do not relabel it.

### Special mappings and complete targeted helper coverage

The separate special-mapping profile exited 0 in 4.2 minutes: exactly 24 cases, once each, zero skips/errors. Every original journey/no-work/cleanup guard and both after-run qualifications passed. The combined root proof confirms the 32-case profile and this 24-case profile are disjoint and bind the same helper SHA256 3753b88e913dd024dd1ed761c86b39905fbc96e1b447f530556b90461c9a98e9. Together these are 56 targeted cases in TWO profiles, not a full 372-case run or a replacement for one. All helper branches, including the three special control/action mappings, have actual focused coverage.

Common-helper full affected build, aggregate test and lint checks completed successfully, followed by serial checks and the C4 commit. The supplemental Busy fence has separate verification pending. No recipe recapture is planned because the actual 44 bound inputs remain unchanged; root retains the existing verified E3 pin and must preserve its hashes. The failed F3 cold result remains 220 passed / one failed / 151 not run; current full 372 acceptance is still unqualified.

### Completed common-helper affected checks

After the controlled GREEN probes and the two disjoint focused profiles (32 and 24 cases), root completed `npx nx build dotnet-conformance`, the full `npx nx test dotnet-conformance` aggregate, and `npx nx lint dotnet-conformance`. Actual unit results were 232 harness tests in 26 suites, 385 runtime tests in 44 suites, and 122 package tests in seven suites, all passed. These results and 56 focused scenarios do not replace a fresh complete 372-case candidate run.

## Supplemental Busy read publication fence

Status: the minimal fixture correction passed SPEC/QUALITY review, actual controlled RED→GREEN, all eight uninstrumented Busy compositions and affected build/test/lint. Complete current CI acceptance remains PENDING.

The Busy read has a distinct HTTP/resource contract from local command refusal. blocked() already waits for actual HTTP completion and unchanged native/network authority, but a fresh page's pending:null can satisfy its existing DOM predicate before Angular publishes lastRead. HTTP completion alone cannot establish that rendered public metadata is visible.

The root-run original-code probe failed the exact Busy disposition assertion: expected Busy, received undefined. It retained one trusted fresh read, one RAF plus one timer interception, old lastRead:null at 288.6ms and actual Busy DOM publication at 1479.7ms. The real response was HTTP 200/schema 2/Busy/revision 7. Page, cleanup and diagnostic errors were empty; postflight retained only the expected test failure. This proves delayed read publication, not a product defect.

The authored change replaces only that immediate Busy lastRead.disposition assertion with a configured bounded poll of the fresh actual status's optional lastRead disposition. It remains before release-native. Existing clicks, held-work/read baselines, native authority, provider/effect/observer/witness guards and release/reconciliation order remain unchanged. There is no new helper, fixed sleep, retry click, timeout override or SDK/template/configuration change. This is not routed through expectLocalRefusal because Busy is a successful metadata read rather than a synchronous local refusal.

Root will freshly bind the changed candidate source, repeat the same actual delayed-render probe for GREEN, execute uninstrumented Busy compositions and affected gates, and retain the complete CI result separately. Existing source-only/full-helper evidence does not qualify the changed whole-file candidate. The common helper body remains byte-identical; the actual 44 recipe inputs remain unchanged.

The prior common-helper full local gates completed successfully: 232 harness tests/26 suites, 385 runtime/44 and 122 package/seven, with build and lint PASS. Those are completed prior-slice checks, not passing gates for this new Busy fence.

### Completed Busy fence verification

The exact controlled probe passed against source SHA256 d29aa4012b460edcb62d12f0208b5d62750065aac77fef7ea93633dde5efb0a5: one trusted read, two app-origin scheduler interceptions, actual old null followed by genuine Busy DOM publication, and the complete original journey/cleanup/post-qualification guards. The test passed in 18.3 seconds. The separate uninstrumented Busy profile passed all eight exact compositions once each in 54.0 seconds, with zero skipped, unexpected or flaky cases and all original guards intact.

Root then completed affected build (including both TypeScript checks), the full test aggregate and lint. Actual results were 232 harness tests/26 suites, 385 runtime/44 and 122 package/seven, all passed. The aggregate took 13 minutes 54 seconds; lint passed in 13.8 seconds. Existing environment color warnings and the Nx Jest executor deprecation remain. These local results do not establish complete 372-case acceptance.

[C4 CI 41592887052](https://github.com/liveloveapp/hashbrown/actions/runs/41592887052) was explicitly cancelled as superseded before source/cold execution. It is neither a functional pass nor a functional failure. A fresh complete workflow at the committed Busy correction remains required before final acceptance.
