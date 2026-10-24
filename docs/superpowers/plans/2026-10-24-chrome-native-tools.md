# Chrome Native Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Verify experimental Chrome v4 tool inference, then expose a fail-closed local transport that delegates execution and permission handling to Hashbrown.

**Architecture:** Follow the reviewed browser-local-capabilities design: a separate experimental typed transport and shared internal stream lifecycle, preserving the existing text/media transports. Recreate one owned session per run from authoritative canonical history; never replay history into a session that already contains it. Initial tools mode rejects structured-output/UI requests explicitly; no silent schema removal or provider fallback.

**Measured compatibility constraint:** Installed v4 emits empty native call IDs. Strict probes reject these. A separately labeled compatibility probe must prove synthesized UUIDs in success/error responses and fresh-session replay before implementation. If verified, normalize only empty-string IDs and require exactly one call whenever normalization is needed; ambiguous batches fail before any executable event. Preserve valid IDs and reject duplicate/conflicting/malformed IDs. This is a scoped adapter compatibility rule, not evidence that native IDs correlate.

**Tech Stack:** Existing TypeScript, AG-UI, Jest, Nx, Playwright, aimock, installed Chrome155. No new package dependencies or application-owned WebLLM changes.

## Task 1: Establish actual native contract before implementation

**Files:**

- Research: `docs/superpowers/research/2026-10-24-chrome-native-tools.md`
- Probe prototype: `/tmp/hashbrown-native-tools-download.cjs`
- Existing probe: `tools/conformance/local-models/native-tools.e2e.ts`

- [x] Download user-authorized v4 in dedicated `/tmp/hashbrown-native-tools-model-profile`, preserving the prior media profile. Require actual activation, record exact flags/options and monitor progress, bound creation/inference, destroy sessions and close contexts.
- [x] Verify a hidden random-token lookup: exactly one typed call with valid ID/name/object arguments, application lookup, typed success correlated by ID/name, exact final token. Capture actual stream shape and `callID`/`callId` behavior.
- [x] Verify error responses and fresh-session assistant-call/user-result history replay with exact declared input types. Probe response-schema composition separately; unsupported does not count as passing.
- [x] Record availability, browser, timing and failures honestly. If actual inference or replay fails, investigate the native boundary before shipping an adapter. Amend this plan with measured limitations before further tasks.

## Task 2: Implement bounded native translation with TDD

**Files:**

- Create: `packages/core/src/transport/chrome-tool-messages.ts` and `.spec.ts`
- Create: `packages/core/src/transport/experimental-chrome-tools-transport.ts` and `.spec.ts`
- Modify: `packages/core/src/transport/local-text-event-stream.ts` and `.spec.ts` only if a small shared lifecycle extraction is needed
- Modify: `packages/core/src/transport/index.ts`
- Generated: core API report through Nx

- [x] Implement and test a serializable capability result separating runtime/browser metadata, input/output modalities, native interface support, model/download availability, adapter support and schema/tools/joint-support reasons; unknown remains unknown. Negotiate exact expectedOutputs text/tool-call and expectedInputs text/tool-call/tool-response with languages/declarations. Property presence and ignored dictionary options cannot establish verified inference. Associate canary evidence with exact browser/model/options; invalidate it when those change.
- [x] Write failing history/declaration tests. Map AG-UI tools to browser declarations; text and typed assistant calls/user tool results preserve order and exact ID/name association. Reject orphan/duplicate result IDs, malformed JSON/object arguments, unsupported roles/media and schema/UI composition before session creation. Text tool results stay text, errors become native errors.
- [x] Run focused `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_NO_CLOUD=true npx nx test core --runInBand --testPathPatterns=chrome-tool --output-style=static`; observe intended failures. Implement minimal immutable translator and verify green.
- [x] Write failing transport tests for exact availability (including a read tools getter), missing constructors, unknown statuses, explicit download opt-in, owned per-run sessions, complete typed stream chunks, text interleaving, multiple calls, invalid/unknown call names, duplicate IDs, null/nonobject arguments and malformed/truncated stream. No invalid call may emit executable TOOL_CALL_END. Validate all calls before exposing execution if stream can still fail.
- [x] Add cancellation/consumer-return/disposal/late-create/late-stream tests and concurrent-run isolation. Each acquired native resource is destroyed exactly once; no completion/executable call after cancellation. Run red then implement then green.
- [x] Export separately named `experimental_chrome_tools` factory and TSDoc public options. Keep DOM types structural and constructors runtime-internal. Verify no-DOM TypeScript consumers and existing text/media tests. Any shared stream refactor must preserve text transport lifecycle tests.

## Task 3: Framework conformance and reproducible local inference

**Files:**

- Create: `tools/conformance/local-models/native-tool-workflows.e2e.ts`
- Modify: local models Playwright config and `tools/conformance/project.json`
- Modify: React/Angular `local-transport` fixtures and tool workflow hosts as needed
- Test shims: existing aimock-backed local model contract infrastructure

- [x] Add deterministic native shim contracts using aimock-backed plans in both actual framework runtimes: single and dependent calls, exact random hidden results, authoritative second-turn replay, error result, Allow/Deny gate before side effects, cancellation and malformed outputs. Write failing cases first.
- [x] Run deterministic opt-in contract target independently; native target requires explicit flags/profile and refuses CI. Downloads require separate opt-in and activation. Unsupported native inference fails or records unsupported explicitly, never passes silently.
- [x] Run real typed success/error/history workflows sequentially in both frameworks with the downloaded profile, collecting exact IDs/arguments/results/latency/lifecycle counts. Keep semantic quality failures distinct from transport failures; do not relax exact hidden-token assertions.

## Task 4: Review, release and merged-source verification

**Files:**

- Update research above, `tools/conformance/README.md`, and React/Angular local-model recipes
- Update design status to distinguish shipped media from experimental verified tools

- [x] Document actual browser flags, separate profile/download ownership, invocation commands, limitations (schema+tools/media/hardware) and application-owned WebLLM interop.
- [x] Independent spec review followed by code-quality review; fix valid feedback with regression tests.
- [x] Run build/test/lint for every affected package/host/docs; core full tests with `--runInBand`, API report, deterministic browser contracts, existing standard conformance. Run each browser Nx target separately and GPU suites sequentially.
- [x] Commit verified changes, create and attach [PR #737](https://github.com/liveloveapp/hashbrown/pull/737), and rebase onto current main.
- [ ] Monitor final exact-head CI and reviews, fix valid feedback, and merge on green without bypass.
- [ ] Verify merged commit/tree equals reviewed head, exact-head required checks passed and merged commit is on origin/main; report actual limitations and any decision required.
