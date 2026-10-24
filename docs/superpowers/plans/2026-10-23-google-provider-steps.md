# Google provider steps implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Follow test-driven-development, AGENTS.md, and the shared contract Rules. Track each step below.

**Goal:** Deliver Google provider steps, ordered native replay, citations and Search Suggestions attribution; keep file search deferred.

**Architecture:** Reuse the neutral canonical history footer from Anthropic. Google-specific pure codecs/helpers retain ordered Content fragments, normalize real server/code lifecycle, and fold grounding independently of tool calls. Request plumbing respects Developer/Vertex capabilities.

**Tech Stack:** Existing TypeScript, @google/genai 2.19.0, AG-UI, Nx/Jest/Playwright; no new dependencies or live recordings.

**Design:** `docs/superpowers/specs/2026-10-23-google-provider-steps-design.md`. Branch `blove/google-provider-steps`, main baseline `b39f70def`, existing isolated worktree `/Users/blove/.codex/worktrees/e2d8/hashbrown`. Baseline Google 35 tests pass.

## Task 1: request API, backend validation and native history

Files: create `packages/google/src/stream/google-history.ts` and `.spec.ts`; modify `types.ts`, `index.ts`, `google-request.ts/spec.ts`, `text.fn.ts/spec.ts`. Coordinate mapper options with its owner; do not edit its implementation concurrently.

- [ ] Write failing request tests for `true` defaults, object pass-through, immutable inputs, Developer circulation + VALIDATED mixed tools, app-only AUTO, Vertex no unsupported flag, backend-specific search fields and public signatures with no internal core types. Add native-type compile assertions and text transform/context tests.
- [ ] Write failing history tests for ordered repeated Contents, signed empty parts, every native call/code/result family, earliest represented anchor, reasoning-only/tool-only/result-only ownership, duplicate/conflicting/malformed/incomplete claims, container-free Google payload, app caller/result chronology, foreign-provider filtering and unsafe legacy server replay.
- [ ] Run `NX_DAEMON=false NX_NO_CLOUD=true npx nx test google --testPathPatterns='google-(request|history)' --output-style=static`; verify intended red evidence.
- [ ] Implement backend-specific Google built-in types and optional fourth request-context parameter. Example: `createGoogleRequestOptions(input, model, signal, {builtInTools, vertexai})`. Preserve existing three-argument behavior. Add final request validation after the transform and before SDK invocation.
- [ ] Implement the owned native codec/replay/capture helpers using core `ɵreadProviderHistory` and constants, with TSDoc. Envelope payload `{contents, representedMessageIds}`; native response metadata may be retained separately. Never reconstruct signatures or provider calls as app functions.
- [ ] Pass canonical input and transformed request to mapper options; include optional backend context. Keep return/abort/error behavior intact.
- [ ] Run focused tests, independent spec review then quality review, fix findings with red/green regression tests, commit focused files when other writers are idle.

## Task 2: provider normalization and grounding

Files: create `packages/google/src/stream/google-tools.ts/spec.ts` and `google-grounding.ts/spec.ts`. These units may have disjoint implementers; neither edits the mapper or request files.

- [ ] Add failing tool tests for native search/URL/code identity, app-name collision, IDs and unique ID-less code pairing, initial args, query/URL labels, typed errors and URL retrieval failure, code OK/failure/deadline/unspecified outcomes, stable readable sources, opaque native preservation and malformed/unsupported families.
- [ ] Add failing grounding tests for call-less grounding, strictly appended chunk deltas with repeated-source index aliases, duplicate URLs with stable index resolution, metadata-only and late chunks, unresolved/invalid citation indices, repeated supports, UTF-8 quote-only handling, exact Search Suggestions HTML, repeated/distinct widgets and native tool-response suggestion HTML. Tool-owned sources require explicit proven linkage.
- [ ] Run `npx nx test google --testPathPatterns='google-(tools|grounding)' --output-style=static` with local Nx permissions; confirm red before production edits.
- [ ] Implement pure normalizers and immutable grounding state. Expected grounding API can return `{state, annotations}`; annotations are cumulative `ɵAnswerAnnotations`, retaining only answer-owned sources. Return normalized tool `{step,content}` without inventing lifecycle.
- [ ] Run focused tests, independent spec then quality review, and resolve findings with regression coverage.

## Task 3: live stream integration and exact capture

Files: modify `packages/google/src/stream/google-events.ts/spec.ts`, create `google-provider-events.spec.ts`; coordinate helper API changes with owners. Existing recorded e2e expectation changes are separate integration scope.

- [ ] Write failing native streams for immediate START before blocked source read, every supported native tool and code outcome, native/app name collision, result-based settlement, unknown/mismatched IDs, unique/ambiguous ID-less code result, unresolved invocation at EOF, pending call restored from prior history, fresh later-result owner, trailing signature, repeated chunk-local indices and repeated native fragments.
- [ ] Write failing metadata/source/attribution tests across early/late grounding and native tool responses; assert no fake tool calls from grounding, public quote-only citations, stable source links and verbatim required widgets. Include invocation-only assistant annotations on TEXT_MESSAGE_END and ownerless metadata-only RAW behavior.
- [ ] Write failing cancellation/error-cleanup/usage/finish regressions and footer-owner tests for text, tool-only, reasoning-only, result-only, empty responses and partial streams.
- [ ] Run focused tests to observe intended failures. Integrate typed helpers; preserve candidate-zero selection, current app dispatch semantics, cleanup precedence, reasoning, cancellation and token accounting. Own native JSON before emitting frames.
- [ ] Seed pending provider calls/timing from canonical/native request context. Emit fresh result message IDs and settle before later chunks. Track represented canonical IDs; emit footer after actual normal completion, not a finish-reason hint.
- [ ] Update only intentional additive legacy test expectations, with strict new tests for footer/native metadata. Run all Google tests; independent spec then quality review.

## Task 4: real-store conformance, recorded e2e and docs

Files: create `packages/google/src/stream/google-provider-conformance.spec.ts`; modify `packages/google/src/integration.spec.ts` and both `www/content/docs/{react,angular}/platform/google.md`.

- [ ] Drive deterministic chunks through `mapGoogleEvents` into `createStore({reducers,prepareAction:ɵprepareRootAction})`; assert no protocol error and public provider outcomes/sources/citations/attribution parity.
- [ ] Commit canonical history, serialize real wire input, restore MESSAGES_SNAPSHOT, create next native request. Assert exact ordered Contents/signatures once, client results in place, no provider-as-function conversion, backend limits and later pending-result chronology.
- [ ] Add regression tests before genuine integration fixes. Use existing core internals only in this integration spec with a minimal explained module-boundary exception if necessary, rather than publishing test-only APIs.
- [ ] Replay existing Google integration fixtures; update assertions for additive markers/footer only. Do not record new fixtures or use live credentials.
- [ ] Document built-in defaults/configuration, Developer/Vertex differences, native persistence/legacy limits and mandatory unchanged adjacent full-width Search Suggestions with no tracking. Keep file search deferred and release notes user-owned.
- [ ] Independent final integration review; inspect API exports/types and dependency diff.

## Task 5: verification and PR

Run all through `npx nx <target> <project>` with `NX_DAEMON=false NX_NO_CLOUD=true` and `--output-style=static`. Local socket restrictions may require escalated execution. Inspect command results, not only shell exit. Run dependency-sharing builds sequentially.

- [ ] `npx nx test google`, `npx nx build google`, `npx nx lint google`, `npx nx e2e google`, `npx nx build-api-report google`.
- [ ] `npx nx test core`, `npx nx build core`, `npx nx lint core`; if core changes also core e2e/API report.
- [ ] `npx nx build react`, `npx nx build angular`.
- [ ] `npx nx build conformance`, `npx nx lint conformance`, `npx nx test conformance`, `npx nx conformance-e2e conformance`, `npx nx provider-e2e conformance` (browser suites sequential).
- [ ] Docs formatting plus `npx nx test www` and `npx nx lint www` as appropriate for content changes.
- [ ] Record passing counts, warnings, any first-run failures and exact red/green review regressions. Check `git diff --check`, final state, new dependencies and secret safety without printing credentials.
- [ ] Commit focused changes; push and create/attach a PR. Exclude coding-agent attribution from commits/PR. Leave unmerged for user instruction on this PR.
