# Plain LangGraph UI helpers

## Scope and decisions

Implement slice 4 of the shared `2026-10-21-b4-tool-step-contract-design.md`. Its Rules remain binding. B4.run main at `de0fdca77` contains the SDK contract and B4 emitters/restore work, but no plain LangGraph helper. Hashbrown main at `834998549` contains the provider slices and shared reducer conformance.

The public subpath is `@b4run/langgraph/ui` (user discussion, 2026-10-24), replacing the unshipped `/tool-step` proposal. Export `emitToolStep` and `toolStepMiddleware`, plus their documented option types. This is a Node server producer surface, separate from the existing edge-safe route entry points. It requires no B4 agent, CLI, filesystem route, or runtime. Existing route entry points must remain usable without the optional LangChain peers.

The user approved the existing repo versions of `@langchain/core`, `langchain` and `@langchain/langgraph` for this helper's optional peers/test dependencies. No Hashbrown dependencies change. File search, provider built-in normalization, answer/attribution producers, UX grouping, upstream changes and Hashbrown release notes remain deferred. No live model requests or recordings.

## Producer API

`emitToolStep(config, step)` dispatches LangChain `on_custom_event` named `b4.step`. Its value is an owned, normalized v1 `B4ToolStep` with a required nonempty `toolCallId`. Validate producer identity/version/status/kind, reuse SDK readers/merge semantics and copy nested data. Normalize labels to 120 Unicode code points and failed errors to the contract fallback. Never emit invented standard tool lifecycle frames: the AG-UI bridge owns START/ARGS/END/RESULT. Explicit configs work in ordinary graph nodes and tools. Middleware can use Node's active runnable config propagation.

Display/transport failures must not replace a tool's result or interrupt. Invalid direct API input is rejected clearly; callback dispatch failures are secondary. Document behavior outside a streamed runnable, including that no listener means no live event. The helper does not checkpoint arbitrary progress by itself.

`toolStepMiddleware({ display })` uses LangChain `createMiddleware` and `wrapToolCall`. `display` is a map keyed by tool name; absent entries still produce a bare server step. Display callbacks receive the call's arguments and, for done/sources, the returned matching LangChain ToolMessage (not an invented parsed raw tool return). Icons are open strings and sources use SDK contract identities. Running/done/failed callbacks are optional and failures fall back to a bare step.

Emit running immediately before executing the handler, with per-call timing and no shared mutable state. On a matching ToolMessage, merge the settled full step into `additional_kwargs.b4_step`, preserving all existing message fields, IDs, content, artifact, metadata and error status. The persisted step omits `toolCallId` (the ToolMessage already supplies that identity); the live value is `{ ...storedStep, toolCallId }`, as CUSTOM requires identity. Respect an already-settled explicit step, including denial/cancellation/failure; an error-status ToolMessage is failed. An ordinary thrown error becomes a readable error-status ToolMessage with persisted failed step. Graph control-flow interrupts are rethrown without false settlement; aborted execution is cancelled, never completed. The original abort/control-flow semantics are preserved.

Support Command results by copying only the matching ToolMessage in their update while retaining graph/goto/resume and unrelated state/messages. Preserve supported object and tuple update forms. A Command without an unambiguous matching ToolMessage passes through unchanged and receives no fabricated completion or result. Document middleware ordering: place this wrapper inside approval/gating wrappers so running means actual execution has started.

## Persistence and bridge recipes

`additional_kwargs.b4_step` is checkpoint data, while CUSTOM is live-only. Restore producers must project the saved step to ToolMessage `metadata['b4.step']` and the failed error text to `ToolMessage.error`. This helper does not alter upstream converters or claim they retain metadata automatically.

Ship a Python recipe using `adispatch_custom_event`, error-status ToolMessage and the published v1 JSON Schema, without a PyPI package. Include an `ag_ui_langgraph.LangGraphAgent` subclass that decorates the parent's MESSAGES_SNAPSHOT while preserving its standard ID/subagent processing. Read a checkpoint once, fail closed if it has no durable checkpoint ID, pin the parent's read to that checkpoint ID, and derive the metadata table from the same snapshot, avoiding a second moving latest-state read. Do not mutate LangChain or AG-UI inputs. Explain package/version extension-point constraints and that unknown contract versions are ignored.

Hashbrown gets React and Angular pages titled "LangGraph without B4" with JavaScript middleware/manual emission, Python and restore recipes, standard AG-UI server/client wiring, headless `serverToolCalls` status/outcome rendering guidance, error handling, approval ordering, and the boundary between live events and durable checkpoint metadata. A JavaScript bridge must likewise project checkpoint metadata; its current private snapshot implementation cannot be overridden as if it were a public hook.

## Verification

- Test-first B4 emitter tests use real runnable custom events and SDK v1 schema/fixture semantics, including owned fields, invalid producer input, labels/errors, and absent/broken listeners.
- Real LangChain tools/createAgent (deterministic fake model) test execution-start timing, parallel call isolation, success, returned/thrown failure, display failures, Command preservation, interrupt/abort and checkpoint JSON round trips.
- Packed-consumer tests verify the `/ui` export, public TypeScript types and optional peer isolation; existing route entry points remain edge-safe and do not load the UI module.
- Keep a small deterministic fixture generated from the helper's actual event and persisted output. Drive it through Hashbrown's real root store/prepareAction and public projection, then commit/serialize/restore a snapshot. Test unstreamed late START and error persistence without a new runtime dependency.
- Validate recipes with executable tests where dependencies already exist; compile/typecheck documented TypeScript examples and verify Python syntax/projection logic. Do not claim an external integration version was executed if only its source was inspected.
- Independent spec review then quality review for each implementation task, final integration review. Run affected package build/test/lint/typecheck and applicable B4 release/pack/docs gates; Hashbrown core build/test/lint/e2e, docs test/lint/build and framework builds. Record warnings and limitations. Open and attach separate B4 and Hashbrown PRs; leave them unmerged.
