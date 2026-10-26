# Opt-in Chrome tools schema finalization

The user authorized design, implementation, local validation, PR creation, merge on green and verification. Keep the existing default and local-only model suites; add no dependency. Reuse this task's clean managed worktree on a new `blove/` branch.

## API and alternatives

Add `schemaFinalization?: 'after-tool-planning'` to `ExperimentalChromeToolsTransportOptions`. Existing `experimental_chrome_tools()` still rejects response schemas. Applications opt in using `experimental_chrome_tools({ schemaFinalization: 'after-tool-planning' })` and their existing chat `schema`. There is no second schema, handler API or framework-specific public type.

The selected approach preserves arbitrary framework-owned tool rounds. Constraining every planning prompt was rejected: the raw v4 canary skipped the requested tool. Finalizing immediately after the first tool result was rejected: it prevents dependent and additional tool calls. A separate stateful orchestration API adds unnecessary history ownership and concurrency risk.

## Run flow

Each canonical run still owns a fresh native session. When a schema is present and the option is enabled, clone/freeze/bound it as a JSON object before creating a session. UI and non-text media remain unsupported even with this option. No-schema requests retain current streaming behavior.

1. With declared tools, pass exact authoritative history once to an unconstrained planning prompt. Buffer and validate the entire native turn using existing call-ID, declaration, JSON, count and output bounds. Discard planning prose from AG-UI/canonical/public output. If calls exist, emit only those executable events; normal Hashbrown handlers, permission decisions and the assistant-turn coordinator own execution and the next canonical run. No transport executes handlers.
2. When the planning turn produces no calls, ask the same session once to produce only the final answer using the supplied response schema and existing conversation/tool results, without calling tools. Pass `responseConstraint` only here. The synthetic instruction remains native-session-local and is never appended to canonical history. This adds one bounded inference pass to a terminal tool-planning run.
3. With no declared tools, skip planning and constrain the authoritative input directly.
4. Finalization accepts text only; reject any typed tool or unknown chunk without exposing executable events. Stream only finalization text through the ordinary AG-UI lifecycle and existing Skillet parser. Do not strip fences, repair JSON, retry with weaker constraints or silently fall back. Skillet remains the framework's schema validator; native `responseConstraint` availability is not proof of arbitrary grammar enforcement.

Planning and finalization share the existing whole-run timeout and cancellation signal. Late creation/prompt settlement and native reader cancellation/destruction remain owned, nonblocking and exactly once. Each native turn retains 4MiB output, 65536 chunks and 64 calls; schema is bounded at 1MiB. Failure aborts the run and rolls back via the existing runtime path. No cross-send session cache or phase inference from historical tool results.

## Capability reporting

Detection accepts the opt-in policy, reports it explicitly and reports adapter structured-output support only for the opt-in. Interface/model availability remains distinct from inference, which stays `unknown`. UI/media stay false. Validate invalid policy values before native creation; browser implementations may reject individual schemas during inference. Public types remain structural and DOM-free.

## Validation and release

Write failing core tests before implementation: opt-in/default rejection, schema ownership/bounds and invalid policy, unconstrained planning, suppression of prose around calls, terminal finalization order/options, dependent canonical replay, no-tools direct schema, finalization rejection of tool chunks, abort/timeout in both phases and late/hung resource cleanup. Preserve all existing native contracts.

Add React and Angular fixture workflows with real framework tools and Skillet schema consumption. Local aimock tests must inspect phase constraints, exact hidden-token/receipt output, additional planning rounds, no planning/synthetic text in public/canonical history, malformed final output, final tool rejection and cancellation/recovery. Real installed v4 smoke tests measure strict hidden-token single/dependent workflows and balanced session/readers; retain actual failures and do not normalize output. Native suites stay opt-in, cache-free, outside CI and sequential on the downloaded profile. Standard existing conformance remains in CI.

Run affected build/test/lint/API reports and standard/local browser regressions. Document one extra pass, unsupported UI/media, strict model-quality limitations, unchanged default and no WebLLM dependency. Review code, create/attach PR, address feedback, merge only after exact-head required CI, compare reviewed/merged trees and verify origin/main.

## Primary evidence

- [Prompt API draft](https://webmachinelearning.github.io/prompt-api/): session-scoped tool declarations, per-prompt response constraints; tools may still be generated with constraints.
- [Previous measured raw prototype](../research/2026-10-24-cancelled-turn-markers.md#separate-tools-then-schema-opportunity): one success is a capability sample, not general composition proof.
