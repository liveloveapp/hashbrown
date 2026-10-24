# Bedrock provider steps implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Follow TDD, AGENTS.md and the shared contract Rules. Independent spec compliance then quality review per task.

**Goal:** Deliver Bedrock provider steps and exact native replay, preserving visible grounding citations; keep file search and the public code-execution enabling key deferred.

**Architecture:** Provider-local native JSON/bytes capture and canonical envelope codec, lifecycle/result normalization and citation fold. Reuse the existing core footer; no core implementation or dependency changes anticipated.

**Tech Stack:** Existing TypeScript, AWS SDK 3.1153.0, AG-UI, Nx/Jest/Playwright. No new dependencies/live calls/recordings.

**Design:** `docs/superpowers/specs/2026-10-24-bedrock-provider-steps-design.md`. Main baseline `9b4ef137`, branch `blove/bedrock-provider-steps`, existing isolated worktree. Baseline 34 unit tests pass.

## Task 1: native codec/capture, request and history

Files: new `packages/bedrock/src/stream/bedrock-native.ts/spec.ts`, `bedrock-history.ts/spec.ts`; existing `bedrock-request.ts/spec.ts`, `types.ts`, `index.ts`. No live mapper edits yet.

- [ ] Write failing binary codec and indexed capture tests: exact interleaved blocks, signed/redacted bytes, result array text/JSON order, citation native locations, unknown/truncated blocks (including closed invocation then EOF without messageStop and implicit text/citation blocks without STOP), mutation isolation, malformed claims and binary tag collision.
- [ ] Run `npx nx test bedrock --testPathPatterns='bedrock-(native|history|request)' --output-style=static`; observe intended red.
- [ ] Implement pure capture/codec helpers. Establish exported internal interfaces: `createBedrockCapture`, `captureBedrockEvent`, `readBedrockCaptureContent`, `encodeBedrockNative`, `decodeBedrockNative`. Capture records block closure/completeness; unsupported native reconstruction is explicit.
- [ ] Write failing request/history cases: true/object defaults, app-only behavior, immutable input, exact native replay once, earliest represented anchor, reasoning/tool/result-only owners, represented marker/role/ID overlap, provenance/type/chronology checks, pending results across responses and foreign provider filtering.
- [ ] Implement exported public `BedrockBuiltInTools`, optional third request context `{builtInTools}`, and validated history API `readBedrockHistory(messages) => {responses,representedMessageIds,providerCallIds}` plus footer creation. Payload contains encoded ordered ContentBlocks and represented IDs; no test-only core exports.
- [ ] Run focused tests; independent spec then quality review; fix findings with red/green. Keep files stable for integration and commit when no writers active.

## Task 2: tools and citations

Files: new `packages/bedrock/src/stream/bedrock-tools.ts/spec.ts`, `bedrock-annotations.ts/spec.ts`.

- [ ] Write failing tests for native discriminator before dispatch, same-name app calls, known/unknown server names, stable IDs and validated query labels, result identity/type mismatch, success/error, interpreter isError/nonzero exitCode/STDERR-only, readable failure and opaque preservation.
- [ ] Write failing citation tests: web/source URL, call-less annotations, repeated source identity versus citation occurrences, quote-only source coordinates, late sources, native document locations, explicit proven tool source reuse, invalid links/indices and input ownership.
- [ ] Run `npx nx test bedrock --testPathPatterns='bedrock-(tools|annotations)' --output-style=static`; observe red.
- [ ] Implement pure helpers with TSDoc, shared core labels, conservative typed errors/source extraction and immutable answer annotations. Normalize transformed native interpreter calls without adding a public key.
- [ ] Run focused tests; independent spec then quality review and red/green fixes.

## Task 3: live mapping and context plumbing

Files: existing `bedrock-events.ts/spec.ts`, `text.fn.ts/spec.ts`; new `bedrock-provider-events.spec.ts`.

- [ ] Write failing SDK streams for immediate START before blocked read, incremental ARGS, result STOP settlement before another chunk, unknown/typed results, pending restored calls, fresh result owner, native/app collisions, no success at END/EOF, result errors and byte/signature tails.
- [ ] Write failing annotation/footer cases: text/tool/reasoning/result-only owner, call-less citations, metadata-only RAW, cancellation/truncation/provider errors/cleanup precedence, native interleaving and token/finish regressions.
- [ ] Run focused tests red, then integrate helpers. Pass canonical messages and actual transformed request to mapper. Keep client continuation flag separate from provider lifecycle. Owner markers include stable Bedrock response identity and native provenance. Footer only for normal complete capture; closure does not settle invocations.
- [ ] Update only additive legacy expectations, asserting strict new metadata/footer fields separately. Run full Bedrock unit tests.
- [ ] Independent spec then quality review; regressions for findings; keep source stable.

## Task 4: conformance and docs

Files: new `packages/bedrock/src/stream/bedrock-provider-conformance.spec.ts`; existing `packages/bedrock/src/integration.spec.ts`; both `www/content/docs/{react,angular}/platform/bedrock.md`.

- [ ] Drive deterministic mapper output through real root store and `toViewMessagesFromInternal`; assert provider status/labels/sources/errors and answer citations, no client dispatch or protocol error.
- [ ] Commit canonical history, serialize real wire input, restore MESSAGES_SNAPSHOT, construct next request. Assert exact native block order/type/status/signature/bytes once; app results retain user chronology; later server results settle old calls under fresh owners.
- [ ] Add regression tests before integration fixes. Keep any test-only module boundary exception minimal and explained.
- [ ] Run existing recorded e2e and update only additive native metadata/footer assertions. No new recordings; explicitly separate recorder limitations from deterministic native coverage.
- [ ] Document option/configuration, Nova constraints, mandatory source-link display, native persistence/legacy fallback and deferred features. No release notes.
- [ ] Independent final spec/quality integration review; verify public API and unchanged dependencies.

## Task 5: final gates and PR

Use `NX_DAEMON=false NX_NO_CLOUD=true`, escalate for Nx local worker sockets if needed. Log to `/private/tmp/hb-bedrock-*`; never print credentials. Keep all dependency-sharing tasks sequential.

- [ ] `npx nx test bedrock`, `npx nx build bedrock`, `npx nx lint bedrock`, `npx nx e2e bedrock`, `npx nx build-api-report bedrock`.
- [ ] `npx nx test core`, `npx nx build core`, `npx nx lint core`; if core changes also e2e/API report.
- [ ] `npx nx build react`, `npx nx build angular`.
- [ ] `npx nx build conformance`, `npx nx lint conformance`, `npx nx test conformance`, `npx nx conformance-e2e conformance`, `npx nx provider-e2e conformance`.
- [ ] Format docs and changed sources; `npx nx test www`, `npx nx lint www` sequential with builds/browser suites.
- [ ] Record pass counts, red/green review regressions, warnings/failures/reruns. Check `git diff --check`, no new dependencies or keys.
- [ ] Commit reviewed files only when other writers idle, push, create and attach PR. No coding-agent attribution in commit/PR. Leave unmerged.
