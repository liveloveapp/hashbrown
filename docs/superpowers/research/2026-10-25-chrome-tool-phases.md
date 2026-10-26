# Chrome application-controlled tool phases: compatibility checkpoint

Status: [PR #749](https://github.com/liveloveapp/hashbrown/pull/749) merged and
verified at `7639ecd41a48ed3d73e26690475e5f477572fb31`. Both fixed native samples
passed the approved single-component subset (8/10 overall each); nested failures
remain strict canaries. The sections below retain the chronological checkpoints.
See [current qualification follow-ups](2026-10-25-local-model-qualification.md).

Research date: October 25, 2026. The user authorized design and implementation
of application-controlled phases after the bounded model-led samples passed only
2/8 and 4/8. Prior failures remain in the component UI research.

## Intended contract and core checkpoint

`experimental_chrome_tools({ schemaFinalization: 'after-tool-planning',
toolPhase(context) { ... } })` selects either exactly one declared tool or direct
schema/UI finalization. The callback reads deeply owned current-turn canonical
user/call/result data; it has no shared phase counter. Tool phases buffer native
output and reject zero/multiple/out-of-phase calls before handler execution.
Finalization was designed to offer no tools while replaying full typed history.

Core test-first work produced the intended failures before implementation. The
checkpoint passes 99 focused tests and 1,879 full core tests (89 suites, 14
snapshots), core production build and API reporting, and applicable lint with
existing warnings. Those are mocked contract checks, not browser compatibility.
Both framework phase fixtures are implemented; all 30 deterministic phase
contracts and 22 unchanged model-led contracts pass. Framework phase inference
qualification remains pending.

## Native compatibility gate

The raw probe uses the already downloaded dedicated profile with Chrome
155.0.8059.85, `gemma4-2b-it` base `2026.06.10.0000`, component `2026.8.7.929`.
It refuses downloads, uses trusted button clicks, records exact session options,
typed call/result identities and stream output, and destroys sessions/closes the
owned browser. This isolates typed replay from component schema/model quality.

- **Changed tool: passed.** A session exposing only `follow_secret` accepted a
  prior typed `lookup_secret` call/success whose declaration was absent. It
  emitted exactly one follow call with the exact fresh token from that result.
- **No-tool finalization: rejected.** The session declared `tools: []` while
  expectedInputs still included tool-call/tool-response. Replaying typed lookup
  and follow call/results failed with `NotSupportedError`: "Tool calls not
  supported. Session is not initialized with tool support."

Evidence: `/tmp/hashbrown-tool-phase-compat-evidence.json`; script:
`/tmp/hashbrown-tool-phase-compat.cjs`. The failure occurred before any terminal
answer, so it does not establish a UI/schema quality limitation. Merely declaring
typed expectedInputs does not initialize the tested session's tool support.

The approved design explicitly treats this rejection as a feasibility blocker.
Implementation and framework work paused; no history flattening or silent tool
restoration was introduced. Unit mocks cannot qualify this browser behavior.

## Reviewed native replay compatibility adjustment

Retain historical native tool declarations during finalization solely to
initialize Chrome's tool-aware session, while the application phase allows zero
executable calls. Hashbrown's terminal stream mode would reject every non-text
chunk before executable events or handlers, and still use the exact response
schema. The model would see historical declarations; the application execution
boundary would forbid calling them. This differs from the original zero-native-
declarations guarantee and is documented explicitly; the application execution
boundary still permits zero calls.

A separate diagnostic probe tests this alternative without changing production
behavior. It is not a retry of the failed zero-declaration contract and is not a
framework/component quality qualification. Evidence is retained separately at
`/tmp/hashbrown-tool-phase-retained-declarations-evidence.json`.
The probe accepted typed replay and emitted no tool calls, but failed its exact
receipt assertion: the returned `value` contained the JSON string of the entire
`{ receipt: ... }` result rather than the receipt property. This establishes
browser acceptance for that configuration, not successful value extraction,
component UI or general model quality. No unchanged retry was performed.


Independent design review approved retaining only declarations referenced by
validated historical calls, in original catalog order, for terminal replay.
Unused declarations remain absent and all finalization calls remain rejected
before executable events/handlers. This preserves the user's application-
controlled phase semantics within the browser constraint; no history summary,
dummy tool or weaker execution policy is introduced. Implementation resumes on
this explicit contract. The exact-value probe failure remains quality evidence;
PR #749 must not merge on core/CI results alone.

## Production qualification matrix

Both production hosts consume the reviewed private-directive core build. Phase
contracts pass 30/30, including atomic call rejection, held partial UI rollback,
Stop/recovery and canonical replay. Existing model-led contracts pass 22/22;
conformance unit tests pass 45/45. Host/conformance builds, TypeScript and lint
pass. Reports are under `test-results/conformance/native-ui-phases`, separate
from the earlier model-led reports.

Before inference, the final native list contains exactly 10 cases: lookup/leaf,
dependent/leaf, lookup/nested, no-tools/leaf and dependent-followed-by-new-user
replay for each framework. Two predetermined complete samples use the same
production code, instructions, schemas and strict assertions. The replay case
compares complete typed call/results in both final prompts and verifies both raw
answer trees, exact handler order and resulting DOM. Every run must balance
readers/sessions and avoid hosted fallback/downloads.

### Application-phase sample 1

At production commit `54c8bd35d8e025939a98c0fdeb2b8dfbc30bf37b`, the first fixed
sample passed **8/10 cases** in 324.9s. Both frameworks passed lookup/leaf,
dependent/leaf, no-tools/leaf and subsequent-user typed replay. Those cases
passed exact tool order, native declarations, prompt/schema phases, raw JSON,
parsed trees, DOM, canonical privacy and complete typed-history assertions.

Both nested workflow cases failed with Chrome `UnknownError: An unknown error
occurred: kErrorUnknown` during the first selected lookup phase. No handler ran,
no native call chunk was emitted, and no terminal response constraint had yet
been supplied. This is a native inference failure in the nested-request workflow,
not evidence that Chrome rejected the component schema or renderer. The strict
operation-count assertion remained failed; no retry or output repair occurred.
All 10 cases ended with zero active readers, balanced sessions, no page errors
and no hosted fallback. Evidence: `/tmp/hashbrown-ui-v4-phases-1-evidence/`
(`live-report.json`, `cases.json`, per-case raw JSON and traces).

### Application-phase sample 2

The second predetermined sample at the same commit passed **8/10 cases** in
336.1s. The same eight single-component cases passed again with all exact
assertions. Both nested workflows executed lookup exactly once and rendered the
requested two status children with correct token values/counts, but set the panel
heading to that token instead of the requested literal `Workflow`. The raw final
JSON confirms the incorrect heading; no output repair or relaxed assertion was
used. This sample demonstrates schema-valid nested rendering, not reliable
layout/prop selection. Evidence: `/tmp/hashbrown-ui-v4-phases-2-evidence/`.

| Workflow | Sample 1 Angular / React | Sample 2 Angular / React |
| --- | --- | --- |
| Lookup + leaf | Pass / Pass | Pass / Pass |
| Dependent tools + leaf | Pass / Pass | Pass / Pass |
| Lookup + nested UI | Chrome error / Chrome error | Wrong heading / Wrong heading |
| No tools + leaf | Pass / Pass | Pass / Pass |
| New user with typed tool replay + leaf | Pass / Pass | Pass / Pass |

All 20 cases settled with zero active readers, balanced sessions, no page errors
and no hosted fallback. The same code/instructions/schemas/assertions were used
in both samples. Single-component cases passed 16/16 across the two fixed
samples. The complete suites remain failed at 8/10 each; nested UI is not
qualified. No unchanged retry was performed.

The user approved shipping the verified single-component workflows on October
25, 2026, with nested failures retained as strict research canaries. The measured
support scope is lookup/leaf, dependent/leaf, no-tools/leaf and cross-turn typed
replay/leaf in these framework fixtures and this Chrome/model configuration.
This does not promise arbitrary single-component prompts or nested UI reliability.
The unfiltered native suite remains 8/10 in each sample; no tests were reclassified
as passing, skipped or relaxed. Exact-head CI and merge verification remain.

## Final implementation regression checks

Core 1,879, React 213, Angular 281, conformance 45 and site 937 unit tests pass;
core has 89 suites/14 snapshots and 99 focused phase/transport cases. All affected
production builds, TypeScript, applicable lint and core API reporting pass.
React has no lint target. Existing tool-step unused-variable, deprecation/API
and chunk-size warnings remain. Phase contracts pass 30/30 and unchanged
model-led contracts 22/22. Standard/provider browser suites pass 64/8; existing
local transport/media/native tools/schema contracts pass 24/4/18/10. The new
phase target refuses CI as expected. All independent reviews approved source;
native limitations remain separate from adapter/renderer correctness.
