# Application-controlled WebLLM structured tool phases

## User-approved direction

Provide a separate, explicit JSON tool protocol: the application selects the permitted tool phase, the model generates constrained arguments, Hashbrown validates complete arguments before canonical tool dispatch, then the model generates the final structured or component UI response. This is Hashbrown orchestration, not WebLLM native `tools`. Preserve application-owned engines and add no dependency. Continue through reviewed PR, protected green merge and post-merge verification. WebLLM audio and cross-hardware work remain deferred.

## Public contract

Add `experimental_webllm_tools({ engine, model?, toolPhase })` as an additive transport factory. `engine` uses the existing default-text `WebLlmEngine`; applications create/load/configure/unload it. `toolPhase` is required and synchronous. New alpha types `WebLlmToolPhase`, `WebLlmToolPhaseResult`, `WebLlmToolsTurnContext` mirror the existing Chrome phase shapes without exposing Chrome names:

- Phase `{ type: 'tool', name }` chooses one declared tool, or `{ type: 'finalize' }` chooses final schema output.
- Deeply owned/frozen context contains thread/run IDs, the canonical latest user `{ id, content }`, and completed current-turn calls with exact call ID/name, bounded frozen arguments and `{ type: 'success' | 'error', text }` results.
- There is no model-selected tool catalog mode, native WebLLM tool mode, automatic model loading, automatic retry/repair, or change to existing `experimental_webllm` defaults.
- A response schema is required at send time, as with Chrome application-controlled phases. Existing downstream structured/UI parsing remains authoritative during finalization.
- This route is text-only, including tool result text. Reject image/audio/video content, media options, unsupported roles and malformed histories before acquiring generation resources. Ignore activity/reasoning records consistently with the existing text adapter.
- App phase selection is routing, not authorization. Existing handlers remain responsible for permissions and confirmation before protected operations.

## Canonical ownership and history

Synchronously clone and validate declarations, history, generation schema and phase decision before an async inference boundary. Never mutate the caller's input, tools, options, schemas or result text. Capture the actual engine/model and callback for this run; subsequent caller mutation cannot change it.

Validate nonempty canonical IDs/names, duplicate names and call IDs, well-formed JSON object arguments, declared tool names, unique exactly correlated results, string content and success/error distinction. Reject unresolved calls and results crossing into a later user turn. Never invent IDs for imported history. Derive current-turn boundaries while walking canonical history (or preserve original source indices); do not apply original user indices to filtered/projected messages, because activity/reasoning records may be interleaved. Imported completed batches may replay, but a new run exposes only the selected single call.

Preserve system/developer instructions in order using existing text-adapter semantics. Append explicit protocol instructions for the selected phase. Retain ordinary user/assistant text verbatim. Project assistant call records and user-role result records as explicitly labeled JSON envelopes with call ID, tool name, argument object and exact result/error text. Mixed assistant text plus calls must retain both. JSON-escape data; never splice tool-result text into the system instructions. Canonical external history stays unchanged and selector context is built from it, not from projected user-role tool results.

## Argument validation and event boundary

Convert declared argument schemas with existing `schema/from-json-schema.ts`. Support its Skillet-convertible subset only: explicit object properties, every property required and `additionalProperties:false`, recursively, plus supported primitive/enum/anyOf/array/numeric constraints. Reject unsupported schema keywords/shapes before inference; do not strip constraints or install a validator dependency. Validate declarations before callback/inference and validate imported/output argument objects using the converted schema.

Tool inference sends no native `tools` property. Its `response_format` is the selected tool's argument schema, not the final UI schema. Instructions name only the selected tool and describe arguments. The model cannot choose a different dispatch name or call ID. Buffer raw model text with a fixed 1 MiB UTF-8 bound before JSON parsing; count whitespace as well as semantic payload and handle split Unicode chunks safely. Reject fences/prose, multiple JSON values, non-object JSON, missing/extra/wrong-type/constraint-invalid fields, truncation or incomplete/invalid completion. A new canonical call ID is adapter-owned and checked against existing IDs.

Require the argument generation to report `finish_reason: 'stop'` and drain its iterator to `done` before exposing any `TOOL_CALL_*` event. Reject other/missing finish reasons, multiple choices or content after stop. A normal stop chunk may contain its final text. Before validation and drain succeed, failure or cancellation must expose zero tool-call events. After dispatch emission begins, already yielded events cannot be retracted: check abort before START, ARGS, END and RUN_FINISHED. Cancellation before END must leave the partial sequence non-executable; after a validated END has been delivered, normal framework handler cancellation applies and already-started side effects cannot be rolled back. Do not synthesize or execute tool results in the transport: emit canonical `TOOL_CALL_START`, one complete `TOOL_CALL_ARGS`, `TOOL_CALL_END`, then matching `RUN_FINISHED` for the framework to validate/dispatch through its normal tool runtime. No intermediate argument text is emitted as assistant content.

Finalization passes the original response schema/UI extension to the existing structured text path, projects completed history without dropping it, and never emits executable tool events. Preserve run/thread IDs and lifecycle events. Cancellation between event boundaries suppresses the remaining events; tests must distinguish a partial pre-END sequence from an already-committed validated call. Generator return/throw/dispose must close the delegate even when validation fails after generation.

## Shared engine lifecycle

Extract a small private raw WebLLM run helper from the existing transport. It owns the single module-level active-engine registry keyed by the original injected engine. Both existing text/images and new structured tools must use it. Do not create an engine wrapper with a different identity or independent busy lock.

The helper retains current preparation, promise/iterator ownership, exception mapping, interrupt and drain behavior. Expose internal strict completion validation only where needed by structured tool argument runs; legacy default streams without finish metadata remain compatible. Use existing `createLocalTextEventStream` with event-stream mode for tool runs so no automatic text lifecycle leaks into tool-only responses.

Overlapping text/image/tool transports sharing one engine fail with MODEL_BUSY. Cancellation settles promptly, interrupts once only if generation began and retains ownership until late create/next and worker iteration have drained. Setup-only cancellation releases promptly without interrupt. Never call load/unload/resetChat or change engine generation settings in production. Preserve owned image preparation/late-resource cleanup and all existing text/image contracts.

## Local qualification

Add separate CI-refusing targets for deterministic structured-tool worker contracts and real app-owned engine qualification. Explicit local flags are required. Real target requires an explicit bundle/model and local download consent; no new default model or dependencies. Reuse installed Chrome, approved WebLLM 0.2.86 / Phi-3.5 Vision and its existing dedicated profile/cache on ports 4451/4452; send text-only prompts for these tool cases. Runtime/model ownership stays in the test application. No extra download/model choice is authorized.

Deterministic contracts exercise both frameworks and actual handler dispatch: selected lookup, dependent lookup, exact schema result, trusted single-component UI, no-tool finalization, follow-up history, error/denial behavior, malformed/wrong-schema args with zero handler execution, cancellation and shared-engine overlap/drain. Use existing aimock-compatible local fixture conventions and model-free worker shims; don't reclassify semantic failures as passes.

Real fixed sample: both frameworks perform a selected lookup then exact final schema output, dependent lookup/replay then exact final schema output, and lookup then one trusted component with exact props/content/count. Use hidden random fixture tokens/receipts and exact arguments/result assertions; prompts may identify requested operations but cannot reveal unseen results. Existing fixture approval/denial remains app-owned. Keep broad catalogs/nested vision UI outside this bounded qualification. No retry or answer repair to obtain green.

Retain durable JSON reports and separate raw generation/schema evidence from input measurements (no image bytes). Record runtime bundle hash, selected model/catalog URLs, settings, phase counts, raw responses, canonical handler history, page errors/fallback attempts, drain and engine/worker cleanup. Assert terminal errors after disposal and guard idle Stop. Catalog URLs remain mutable; do not claim pinned weight identity, broad reliability or cross-hardware support. Preserve failed runs before any follow-up.

## Validation and delivery

TDD with top-level test and arrange/act/assert spacing, TSDoc for new public/reusable functionality, no new dependencies. Independent spec and quality reviews. Verify core build/test/lint/API report, conformance build/test/lint, both fixture builds/lint, affected model-free contracts and actual-engine qualification. Verify consumer compatibility with real 0.2.85/0.2.86 declarations without casts/ambient stand-ins. Existing API/tooling warnings must be reported. Create/attach PR, resynchronize protected main as necessary, merge on green without bypass, compare reviewed/merged trees and rerun bounded local qualification on the merge commit.
