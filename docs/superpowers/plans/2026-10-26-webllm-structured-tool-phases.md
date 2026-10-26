# WebLLM structured tool phases implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task. Use checkbox steps and independent spec then quality review before proceeding.

**Goal:** Implement opt-in application-controlled schema tool calls and final schema/UI using an app-owned WebLLM engine, preserving canonical history and no-dependency defaults.
**Architecture:** A private raw-run helper shares ownership/drain across existing text/images and new tools. A strict projection/validation layer owns canonical history and builds one selected argument-schema request. New tool transport fully buffers validated arguments into canonical events, while final output reuses schema streaming.
**Tech Stack:** Existing TypeScript, AG-UI, Skillet schema conversion/validation, Jest, Nx and Playwright. Existing application WebLLM bundle/model only; no dependencies, custom audio builds or cross-hardware tests.
**Spec:** `docs/superpowers/specs/2026-10-26-webllm-structured-tool-phases-design.md`.
**Worktree:** `/Users/blove/.codex/worktrees/webllm-images/hashbrown`, branch `blove/webllm-structured-tools`, base `5f1aa664719a584767718fd86c9a8b4f1d5b0d50`. Local hosts use4451/4452, never native profile/ports.

## Task 1: Shared raw generation lifecycle

Files: existing `packages/core/src/transport/experimental-webllm-transport.ts`, new private `webllm-run.ts` and focused specs under the same directory.

- [x] Run baseline existing WebLLM text/image and local ownership unit tests; record results.
- [x] Write failing strict-completion cases: valid stop+done, missing/length/other finish, multiple choices, post-stop text, stop carrying final text, stop followed by gated done, Unicode chunks. Keep legacy default behavior assertions.
- [x] Extract raw run ownership/streaming/drain from existing text adapter into private helper, keyed by original engine; no public signature/behavior change. Preserve image async preparation and cleanup callbacks.
- [x] Use helper in existing text/image transports. Strict completion is internal and opt-in, not a public flag.
- [x] Verify synchronous engine error, late create/next, external abort/dispose/return/throw, setup cancellation, captured engine and all existing text/image tests. Verify stop+gated done retains lock.
- [x] Build/test/lint core as appropriate; commit coherent helper/refactor after tests pass. Independent spec then quality review before new transport work.

## Task 2: Public phase types and strict canonical request preparation

Files: new `experimental-webllm-tools-transport.ts` (public types here; factory implementation in Task 3), new private `webllm-tool-messages.ts`, transport barrel and specs; minimal proven ObjectType.validate fix in `schema/base.ts` with `schema/validation.spec.ts` regressions.

- [x] Add failing public type controls for required selector, text engine assignability, no Chrome/internal-type leakage and rejection of media options. Confirm expected RED.
- [x] Add failing history/declaration tests for owned/frozen selector context, exact escaped content, call/result/error IDs and text, dependent/current-turn ordering with interleaved activity/reasoning records (no filtered-index mismatch), mixed assistant text/calls, prior completed turns, duplicates/orphans/unresolved/cross-turn results, unsupported roles/media, malformed JSON/declarations and all schema subset limitations. Explicitly reject tool argument format annotations recursively without rejecting a normal property named format; existing runtime formats are annotations, not asserted by StringType.validate. Guard explicit enum/type intersections recursively so conversion cannot weaken a declared type, with valid homogeneous/omitted-type enum controls. Reject reserved argument property names before conversion. Fix shared ObjectType.validate to reject arrays at every nesting/anyOf position, with failing direct/nested/array-item/branch-discrimination tests, instead of duplicating recursive schema interpretation.
- [x] Implement additive public alpha types with TSDoc; no production WebLLM imports or new dependencies. Defaults of experimental_webllm remain unchanged.
- [x] Implement synchronous whole-request snapshots, Skillet conversion/validation, immutable phase selection and explicit JSON history envelopes. Unsupported inputs fail before engine acquisition. Test selector/input/schema ownership during preparation; factory engine/model/callback mutation after send is verified in Task 3.
- [x] Verify selected request has no native tools, uses only selected argument schema/instructions, retains system/developer text and final response schema separately.
- [x] Run focused RED/GREEN and core compile/API report; commit. Independent spec then quality review.

## Task 3: Canonical tool event boundary and finalization

Files: new tool transport implementation/spec; private byte-buffer utility only if needed; raw helper integration.

- [x] Verify factory snapshots engine/model/selector before callbacks and preserves owned lifecycle IDs under after-send mutation. Write failing lifecycle tests for one valid selected call: matching RUN_STARTED, canonical tool START/completeARGS/END/RUN_FINISHED, no assistant argument text and no result synthesis.
- [x] Add strict failure tests: invalid JSON, fences/prose/multiple values, nonobject, schema mismatch/missing/extra fields and numeric constraints, UTF-8 overflow including whitespace/split Unicode, truncation/missing stop/poststop text, malformed engine chunks, duplicate generated ID, abort at each boundary, generator return/throw/dispose and delegate failure. Assert zero tool events for generation/validation failures before emission. Check abort before START/ARGS/END/RUN_FINISHED; assert zero handler dispatch for pre-END partial sequences, and normal cancellable handler semantics after a validated END (no rollback promise).
- [x] Implement bounded raw collection then JSON parse + schema validation + new ID and selected-name binding, only after successful stop+iterator done. Reuse createLocalTextEventStream event-stream lifecycle and shared original engine lock.
- [x] Implement finalization through original response schema/UI and projected complete history, with zero tool events. Preserve text/UI streaming and errors.
- [x] Add shared-ownership tests in both directions: text↔tools, images↔tools, two tool transports; pending worker create/next and gated drain remain busy until done. Never load/unload/resetChat.
- [x] Run all core tests/build/lint/API and real .85/.86 structural declaration consumers. Review public exports and document schema limits; commit. Independent spec then quality review.

## Task 4: Local-only deterministic framework/worker contracts

Files: `tools/conformance/hosts/{angular,react}/src/local-transport.ts`, existing schema/UI/workflow fixtures where reusable; new `local-webllm-tools.playwright.config.ts`, `local-models/webllm-tools.e2e.ts`, worker shim, harness gate tests, project.json/tsconfig/README.

- [x] Add failing explicit local gate / CI-refusal tests and model-free browser cases using existing @copilotkit/aimock LLMock plus installLocalModelShim for functional workflows, and controlled workers for lifecycle/drain cases. Do not add a package or initialize real inference in these cases.
- [x] Wire explicit localModel=webllm-tools selection and application phase callback from canonical context. Reuse existing handlers/permission checks, schema and trusted leaf-component workflows without changing native routes/defaults.
- [x] Cover selected lookup, dependency and exact replay, error and denied operations, direct no-tool finalization, subsequent turn, malformed/wrong-type args with zero handler calls, cancellation and overlap/drain. Assert canonical external history, system instructions, handler args/counts, final output and no HTTP fallback/page errors.
- [x] Add durable JSON report with separate schema/raw response and metadata attachments on success/failure, including after cleanup. Guard idle Stop; no model input payload logs.
- [x] Verify conformance build/test/lint, both production host builds/lint, all new contracts and affected existing text/image/schema/UI contracts. Use4451/4452 and explicit local flags; commit. Independent spec then quality review.

Task 4 verified and independently approved at `1622dff1b93a5031bc19cb518ad4d1ecece33593`: 36 new and 102 existing browser contracts, 80 unit tests, conformance build/lint and both host production builds/lints passed. Review fixes add post-disposal exact terminal assertions, atomic shim observation, and independent canonical/replay argument expectations; retained mutation reports prove the checks reject corruption. Latest main `a2c780b270f5acc506689d8dc543257cc17b5cb9` was merged without incoming core/conformance/manifest changes.

## Task 5: Explicit real-engine qualification and delivery

Files: separate local real WebLLM tool-phases config/test, runtime bridge only where needed for metadata, research/README records.

- [ ] Add fail-closed local/live/download gates, explicit bundle/model/no default, CI refusal, durable reporter and dedicated existing WebLLM profile selection. `--list` must not import runtime/load model.
- [ ] Prepare fixed six-case real sample (two frameworks × lookup+schema, dependency+schema, lookup+single-component UI). No broad/nested/media claim. Hidden random tokens, exact handler args and canonical replay, schema/DOM, counts and terminal cleanup checks.
- [ ] Run the approved application-owned `.86` bundle `/tmp/hashbrown-webllm-types/086/package/lib/index.js` and `Phi-3.5-vision-instruct-q4f16_1-MLC` with existing dedicated cache on4451/4452. No other model/runtime/download is authorized. Retain all results before follow-ups; no retries/repair/relaxed assertions to force green.
- [ ] If strict quality fails, diagnose transport versus model with raw calls/schema/output and exact history. Fix proven bugs with RED/GREEN; ask user only for a material quality/scope/model decision.
- [ ] Run required affected build/test/lint/API and type checks, review complete diff/spec/quality, record warnings and bounded support in research/README. Record audio/cross-hardware deferrals.
- [ ] Commit/push/create PR, attach it to this chat. Merge only after protected CI passes; resynchronize latest main rather than messaging other chats. No publishing or upstream posting.
- [ ] Verify merged tree matches reviewed head, rerun the bounded local real canary on merge commit, archive JSON/raw/cleanup/CI identities and update original shared worktree. Stop only for the next material decision.

## Standard command environment

Use `npx nx <target> <project>`; core/conformance unit checks `NX_DAEMON=false NX_NO_CLOUD=true NODE_ENV=test`, browser/host builds `NODE_ENV=production`. Browser suites also set `LOCAL_LLM_E2E=1 RUNTIME_SMOKE_ANGULAR_PORT=4451 RUNTIME_SMOKE_REACT_PORT=4452` and their explicit local target flag. Real runs use approved bundle/model plus download consent, no CI. Do not run heavy unit/build commands concurrently with timed GPU inference.
