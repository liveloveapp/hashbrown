# Chrome application-controlled tool phases: compatibility checkpoint

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
checkpoint passes 93 focused tests and 1,873 full core tests (89 suites, 14
snapshots), core production build and API reporting, and applicable lint with
existing warnings. Those are mocked contract checks, not browser compatibility.
No framework phase fixture or phase workflow qualification has been implemented.

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
