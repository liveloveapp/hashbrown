# Anthropic provider steps implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Follow test-driven-development and the repository AGENTS.md. User approved the design on 2026-10-22.

**Goal:** Complete slice 3a: Anthropic server tools become live provider steps with citations, and exact native history survives store/snapshot/continuation.

**Architecture:** The Anthropic mapper streams standard lifecycle frames with `b4.step`, retaining native call/result payloads. A neutral `hashbrown.provider-history` footer persists an ordered native response envelope on an existing canonical owner. Anthropic replay prefers complete validated envelopes; legacy replay filters provider calls and retains existing client-tool behavior.

**Tech Stack:** Existing TypeScript, AG-UI, Anthropic SDK 0.122.0, Nx/Jest, core metadata/history primitives. No dependency changes or live recordings.

**Spec:** `docs/superpowers/specs/2026-10-22-b4-provider-steps-design.md`, Anthropic delivery only. Shared tool-step design Rules remain binding. Existing managed worktree `/Users/blove/.codex/worktrees/e2d8/hashbrown` is clean and isolated; branch `blove/anthropic-provider-steps`, baseline main `5e752cc7` plus approved design commit.

## File and interface boundaries

- Core: create `packages/core/src/models/provider-history.ts` and its spec; modify canonical reducer and accumulator only where persistence requires; root-store/history tests and `public_api.ts` ɵ exports. No provider SDK imports in core.
- Request/replay: create `packages/anthropic/src/stream/anthropic-history.ts` and spec; modify request mapper/types/text.fn/index and request tests. Codec owns native envelope validation and replay grouping.
- Live mapper: modify `anthropic-events.ts`, extracting focused provider-tool/source/native-capture helpers into `anthropic-tools.ts` / `anthropic-history-capture.ts` as warranted, with specs. Existing validation/cancellation/reasoning behavior remains tested.
- Integration: a new deterministic `anthropic-provider-conformance.spec.ts` drives mapper → real root store → wire/snapshot history → request serializer. Existing recorded e2e stays replay-only.
- Documentation: both framework Anthropic platform pages, API report, migration guides only if public behavior warrants, no release notes.

Shared footer wire shape: `{v:1, provider:string, ownerMessageId:string, responseId:string, complete:boolean, payload:Record<string,unknown>}`. Event name and metadata key are both `hashbrown.provider-history`. Export only ɵ names: `ɵPROVIDER_HISTORY_EVENT_NAME`, `ɵPROVIDER_HISTORY_METADATA_KEY`, `ɵProviderHistory`, `ɵreadProviderHistory`. Reader returns an owned JSON value or undefined for malformed/unknown versions.

Carrier identity: `metadata[provider].responseId`; assistant owners may establish identity through their own metadata or a contained invocation's metadata. Result-only responses use a fresh explicit TOOL_CALL_RESULT.messageId. A footer must never target a user/activity/different-response owner. Preserve unrelated metadata; duplicate equal footers are no-ops; conflicting valid envelopes are rejected transactionally without changing stored data. Unsupported/malformed footers are ignored. Do not change any lifecycle for a footer.

Anthropic payload: `{blocks: ContentBlockParam[], representedMessageIds: string[], container?: Container|null}`. The mapper records every canonical message it emits for this native response (assistant, reasoning, provider result), and its owner is one of those ids. Preserve the final native container object; replay sends its id. SDK native response id is the response key, with adapter-owned fallback when necessary. Reader checks block shapes/opaque fields and represented ownership before complete-envelope replay. Group at the earliest represented canonical position, emit once, suppress only represented native content; preserve subsequent app tool results. Incomplete envelopes never suppress canonical data and unsafe server-block continuation rejects clearly.

Mapper options may add optional `inputMessages` (canonical context for prior step identity/timing) and `requestOptions` (actual transformed native request for pending invocations, document/source lookup). `text.fn.ts` passes both. Existing direct mapper tests without context remain supported.

## Task 1: neutral native-history persistence

- [x] Write model/reader tests and root-store tests for assistant text, tool-only assistant owner, result-only tool message, reasoning-only owner, correct/mismatched response identity, malformed/unknown versions, immutability, duplicate/conflict, and snapshot/history round trip.
- [x] Run `NX_DAEMON=false NX_NO_CLOUD=true npx nx test core --testPathPatterns=provider-history --output-style=static`; confirm failures caused by missing behavior before production edits.
- [x] Implement the owned reader/constants/type, canonical CUSTOM fold, and only the accumulator/history changes demonstrated necessary by real-store tests. Reuse existing JSON ownership and transactional event decision machinery. Add TSDoc to all reusable symbols and ɵ exports.
- [x] Repeat focused tests, then full core tests. Review spec compliance, then code quality, before completing this task.

## Task 2: typed built-ins and exact Anthropic replay

- [ ] Add failing request tests for true defaults, SDK-version object pass-through, citations default on fetch true, tools/schema coexistence, immutability, transform plumbing, and ɵ-free public signatures.
- [ ] Add failing codec/replay tests for complete ordered blocks, tool-only/reasoning-only/result-only envelopes, duplicate ownership, malformed payloads, incomplete envelopes, signed/redacted/encrypted fields, container reuse, app caller values, mixed client/provider results, legacy and foreign-provider filtering. Include two responses whose server call settles after app results.
- [ ] Run `npx nx test anthropic --testPathPatterns='anthropic-(request|history)' --output-style=static` with Nx local-socket permissions; confirm intended red results.
- [ ] Implement `AnthropicBuiltInTools` with `true` defaults from the approved spec and SDK-version configurations (omit only the fixed name), pass through text.fn, export public type, and validate/replay native envelopes with clear errors. Preserve the legacy reasoning path for histories without native envelopes.
- [ ] Wire optional mapper context fields without implementing live mapping here. Run focused tests, spec review, then quality review.

## Task 3: live server calls, native capture and citations

- [ ] Add failing native streams for server START/ARGS/END, every native result family, typed errors, nonzero return codes, encrypted stdout, unknown/empty arguments, parent caller, early START while source is blocked, and provider/client name collision. Pin result-based settlement and no client continuation for internal completion.
- [ ] Add failing citation/source tests: initial/delta citations, search/fetch/file results, URL duplicates and unmatched citations, document/index resolution, quote-only source coordinates, native opaque replay bytes, and explicit citations disabled in object config.
- [ ] Add failing capture tests for interleaved thinking/text/calls/results, no-text owner choices, result-only later response, final message_delta container, abort/incomplete response, and footer placement before terminal without delaying RESULT.
- [ ] Run focused tests and confirm red. Implement a native collector independent of canonical display, server/result block states keyed by index and correlated by native id, sources/citations, native metadata and footer. Preserve existing RAW visibility where compatible, validation, cancellation, reasoning signatures and usage.
- [ ] Extend shared labels using table-driven core tests. Add mapper context lookup for outstanding calls and preserve prior start time/identity. Do not claim success for pause_turn or unresolved invocation.
- [ ] Run full Anthropic tests and focused core tests; spec review followed by quality review.

## Task 4: real-store conformance and docs

- [ ] Write a deterministic native two-turn stream fixture in test code, not the recorded fixture directory. Exercise createStore({reducers, prepareAction:ɵprepareRootAction}) and the actual wire projection, as root reducer tests do. Include interleaved reasoning, server success/error, app call collision, prior pending server completion and snapshot restore.
- [ ] Confirm store-carried native envelopes survive projection/restore and next request contains exact native blocks once, original opaque values/container, proper client result placement, no provider-as-function conversion. Demonstrate failed public outcome and citation/source parity.
- [ ] Fix genuine integration gaps test-first; do not weaken contract assertions. No live calls/recordings or dependencies.
- [ ] Update React and Angular Anthropic docs with typed built-ins, true defaults, citations, display obligations and native replay; document the footer's persistence purpose and legacy limitations. Mark spec approved and track plan completion.

## Task 5: final validation and reviewable PR

- [ ] Run `npx nx test core`, `npx nx build core`, `npx nx lint core`, `npx nx e2e core`, `npx nx build-api-report core`.
- [ ] Run `npx nx test anthropic`, `npx nx build anthropic`, `npx nx lint anthropic`, `npx nx e2e anthropic`, `npx nx build-api-report anthropic`.
- [ ] Run existing cross-framework conformance: `npx nx build conformance`, `npx nx lint conformance`, `npx nx test conformance`, `npx nx conformance-e2e conformance`, `npx nx provider-e2e conformance`. These complement the new real-store Anthropic spec.
- [ ] Run `npx nx build react`, `npx nx build angular`; targeted www tests/lint for edited documentation as appropriate. Report all warnings/failures and distinguish recorded replay from new deterministic native coverage.
- [ ] Request final independent spec/correctness review, then code-quality review; fix findings with regression tests. Check git diff, API reports, dependencies and secret safety without printing keys.
- [ ] Commit focused changes, push branch, open/attach a PR. No attribution mentioning coding agents. Leave merge/release for user approval; no Hashbrown release notes.

### Task 1 evidence

Core baseline 1,513 tests; footer implementation 1,548 tests/14 snapshots pass, plus build/lint pass. Focused35tests; observed red before code, including response uniqueness and inherited-identity regressions. Independent spec and quality reviews approved. Core lint retains three pre-existing unused-variable warnings in tool-step.ts. No accumulator changes were needed because canonical history is the request source of truth.
