# OpenAI/Azure code-execution implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development serially,
> with fresh implementation context, test-first steps, independent spec then
> quality review, and parent-owned commits. Checkbox steps track completion.

**Goal:** Complete provider code-execution display for OpenAI and Azure without
file search or a new runtime dependency.

**Architecture:** Keep existing SDK bindings and stateless history. Add bounded
provider-local code-call helpers, then integrate file annotations and real root-
store/two-turn conformance. Public chat/core shapes already cover these fields.

**Tech Stack:** Installed OpenAI SDK, AG-UI 1.0.3, TypeScript, Nx/Jest; no new deps.

**Spec:** `docs/superpowers/specs/2026-10-28-openai-azure-code-execution-design.md`.

## Task 1: Typed enabling and request plumbing

Files: `packages/{openai,azure}/src/stream/types.ts`, the existing
`{openai,azure}-request.ts` and corresponding `-request.spec.ts`.

- [x] Add failing tests for `codeExecution:true`, native explicit/automatic
  configuration cloning, app-tool + web-search coexistence, reasoning includes,
  structured schema and off behavior. A fresh config cannot mutate frozen input.
- [x] Confirm RED using `npx nx test openai --testFile=openai-request.spec.ts
  --runInBand` and the equivalent Azure target. Record logs.
- [x] Add the spec's SDK-derived optional type and TSDoc. Append the native
  `code_interpreter` tool and `code_interpreter_call.outputs` include; `true`
  resolves to `{container:{type:'auto'}}`. Preserve all existing options.
- [x] Run focused tests, package build/lint; independent spec then quality
  review, fix findings, and parent commits reviewed files only.

## Task 2: Provider code-call lifecycle and partial arguments

Create `packages/openai/src/stream/openai-code-execution.ts` and
`packages/azure/src/stream/azure-code-execution.ts` with focused `*.spec.ts`.
Modify existing provider event modules/specs to delegate SDK code-call events.

- [x] Write failing state-machine/mapper tests: live START before completion,
  `{code:string}` partial JSON (quotes, slashes, newline and split Unicode),
  argument END once, multiple interleaved IDs, no-delta code, final code suffix,
  contradictory code, missing item-done terminal fallback, duplicate framing,
  terminal outputs, failed/incomplete vs nonterminal statuses, abort and EOF.
  Include native `code:null` (empty argument object when no code was observed)
  and failed-response native details yielded before the enclosing error.
- [x] Run focused Nx tests to establish actual RED before helper code.
- [x] Implement immutable per-call state with typed native input and contract
  output. Keep argument finality separate from execution settlement. Read the
  actual terminal status; never infer success from an output-item-done frame
  whose status is still nonterminal. Ignore unsupported events without touching
  unrelated text/reasoning/app-tool state. Use shared labels/timing and native
  identity markers. Reconcile terminal output without duplicate unchanged calls.
- [x] Validate emitted frames with `EventSchemas`, and add an async consumption
  test that observes START/partial args while later native events are blocked.
- [x] Focused GREEN, package build/lint; independent spec then quality review;
  parent commits. No new core export or generic provider engine.

## Task 3: File annotations and truthful stateless history

Files: existing `packages/{openai,azure}/src/stream/*-events.ts`, `*-input.ts`
and their specs. Add small provider-local annotation helpers if necessary to
keep normalization separate from event orchestration.

- [x] Test first: streamed/final-only file and container-file annotations;
  repeated delivery vs distinct occurrences; annotation before text; mixed URL
  and file citations; same filename/different IDs or containers; multipart span
  offsets; invalid/missing spans; file-list index not a character span; native
  final-text suffix without duplicate output; no fabricated href/call ownership.
  Cover astral-text and interleaved-part ambiguity by retaining file references
  while omitting unprovable global spans, without changing existing URL behavior.
- [x] Establish RED, then implement owned native annotation occurrence tracking,
  stable source identity, validated offsets and final native-message enrichment.
  Keep URL matching/UTM behavior covered. Native image output URLs may be call
  sources; container-file annotations remain answer sources.
- [x] Test provider omission with missing/malformed/unknown step metadata using
  the native `itemType:'code_interpreter_call'` marker, while same-name ordinary
  app calls/results and replayable reasoning retain existing behavior.
- [x] Establish RED and extend provider recognition. Do not add a response-history
  footer, storage API, file-search option, or change `store:false`.
- [x] Focused GREEN, build/lint; independent spec then quality review; parent
  commits. Report any spec conflict instead of weakening a contract assertion.

## Task 4: Real store, HTTP seam, docs and delivery

Create `packages/{openai,azure}/src/stream/*-provider-conformance.spec.ts`, using
the neighboring Anthropic/Google/Bedrock conformance suites as the pattern.
Extend OpenAI's existing `text.http.spec.ts`; create
`packages/azure/src/stream/text.http.spec.ts` using the OpenAI HTTP suite as the
pattern (Azure's current stream tests mock the SDK). Modify stream specs and
`www/content/docs/{react,angular}/platform/{openai,azure}.md`.

- [ ] Write failing real-root-store tests with `createStore({reducers,
  prepareAction:ɵprepareRootAction})`. Drive native fixtures through the mapper,
  project calls/answers, restore native history and build a second request.
  Assert success/failure, code arguments, native results, stable citations and
  provider identity before same-name client dispatch. Preserve ordinary app
  calls/results and prove no provider `function_call`/output appears in replay.
- [ ] At the existing SDK HTTP seam assert the native request's tools/includes,
  source outputs, default/explicit container config and second-turn input.
  Use deterministic fixtures, no keys or recordings. Fix genuine defects with
  focused RED/GREEN, and review source changes before committing.
- [ ] Update four guides/options tables: code execution, native configurations,
  displayed results/outcomes, generated-file IDs and app-owned downloads,
  explicit-container reuse and stateless omission. Keep deferred items absent.
- [ ] Run `npx nx test openai --runInBand`, `npx nx build openai`,
  `npx nx lint openai`, `npx nx e2e openai --runInBand`,
  `npx nx build-api-report openai`; repeat for Azure. Inspect reports for the
  exact SDK-derived option and no unintended public API changes.
- [ ] Run `npx nx test core --runInBand`, `npx nx build core`,
  `npx nx lint core`, then sequential `npx nx build react` and
  `npx nx build angular`. Run docs test/lint/build. Inspect all logs, report
  warnings and avoid concurrent dist writers. Existing passing fixtures remain
  baseline coverage, not a claim of live built-in qualification.
- [ ] Final aggregate review; parent updates verification evidence, commits,
  pushes and opens/attaches a focused PR. Keep auto-merge off until authorized.

## Baseline

OpenAI and Azure unit suites passed before implementation. Logs:
`/private/tmp/code-execution-{openai,azure}-baseline.log`. No dependency manifests
were changed. The clean managed checkout was reused on
`blove/openai-azure-code-execution`, based on current main `c155e8a2`.

Task 1: independent spec and quality review approved. Focused request tests:
OpenAI 14 passed, Azure 15 passed; both builds and lint passed. RED logs show
four expected missing-tool failures per provider before implementation.

Task 2: spec and quality review approved after test-first corrections for
nonterminal argument finality, stable settlement time and JSON-value result
deduplication. Full OpenAI 118 tests / 7 suites, Azure 108 / 6 passed; both
builds and lints passed. Sources/results retain native values and array order.

Task 3: independent spec and quality review approved. Full OpenAI 144 tests,
Azure 134 tests passed; both builds and lints passed. Test-first follow-ups
covered SDK annotation ownership, malformed URL titles, empty annotated answers
and repeated terminal frames, as well as file identity and conservative spans.
