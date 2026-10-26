# Production and runtime docs implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for independent units; review specification compliance and implementation quality before integration.

**Goal:** Make endpoint access, server-owned text storage, and QuickJS execution reproducible in the docs.

**Architecture:** Extend the checked Quickstart examples with a composable Express app and versioned thread repository, native framework clients, and a direct QuickJS example. Record actual interactions with deterministic provider/session fixtures. Preserve existing URLs and site typography.

**Tech Stack:** Existing TypeScript/ngc, Express, Hashbrown, AG-UI, Vitest, Vite, Playwright, ffmpeg.

## Tasks

- [x] Review design and plan against the approved docs direction and current APIs.
- [x] Write failing HTTP tests, then implement `www/examples/quickstart/server/thread-app.ts`, `thread-store.ts`, and `thread-server.ts`: ownership, request validation, pinned input, admission limits, SSE/abort handling, atomic version checks. Real provider integration remains injectable; local fixture identity is recording-only.
- [x] Implement native `ServerConversations.tsx` / `server-conversations.ts` clients and identical `server-history.ts` transport helpers. Tests validate response shapes; exact file snippets in Threads must match compiled sources. Show conflicts and recovery, serialize saves, prevent stale selection work.
- [x] Implement `RuntimeDemo.tsx` / `runtime-demo.ts`, checked basket data/function contract, and accurate Runtime guides. Verify real QuickJS calculations, unavailable globals, error wrapper/recovery, host function and context limits. Explain optional javascript-tool integration.
- [x] Add a focused production recorder/fixtures under `www/src/tools`, an Nx `docs-production-demo` target, and the three catalog entries. Verify both SDKs; generate all media and inspect actual frames/captions/screenshots.
- [x] Rewrite Public endpoint and Threads around complete checked files, preserve detailed ATC links, state production integration and text-only boundaries; update inventory and example README.
- [ ] Run `NX_DAEMON=false npx nx test www`, lint, typecheck, build, and e2e sequentially; verify built routes/media/scroll/mobile. Review all changes, create PR, merge on green, and verify deployment.

## Working notes

Use this existing isolated worktree on `blove/docs-production-runtime`, based on main `230c3e4d`. No dependencies or library API changes. Keep all generated-package operations sequential. Never disable Nx plugin isolation. Read Brian's older writing before drafting. Keep recording fixtures separate from production adapters; do not describe in-memory storage or local sessions as production infrastructure.

## Implementation contracts and executable checks

### Endpoint and repository

Files: `www/examples/quickstart/server/thread-app.ts`, `thread-store.ts`, `thread-server.ts`; tests `www/test/docs/thread-app.spec.ts`, `thread-store.spec.ts`.

- [ ] Write HTTP tests first and run `NX_DAEMON=false npx nx test www -- --testNamePattern=thread`; expect missing modules, then actual rejection assertions.
- [ ] Implement `createThreadApp({origin, authenticate, allowRun, store, stream})`. `authenticate(Request)` resolves an owner ID or null. `allowRun(ownerId)` is an injected admission decision. `stream(RunAgentInput, AbortSignal)` produces AG-UI events.
- [ ] GET `/api/threads/:id` returns `{id,version,messages}` or 401/404. PUT accepts `{expectedVersion,messages}` with matching configured Origin and returns the incremented snapshot, 409 on conflict. ThreadStore exposes owner-scoped read and atomic compareAndSwap, immutable snapshots, cloned input. Initial IDs are provisioned by the application; no unauthenticated create API.
- [ ] POST `/api/chat` requires identity, matching Origin, an owned thread, bounded text input, and admission. Drop client system/developer turns and pin a fresh system prompt. Reject unsupported tools/resume/nontext messages; reset tools/context/state/forwardedProps. Preserve validated thread/run IDs. Limit JSON to 64KiB, 100 text messages, 10000 characters per message. Test unauthorized foreign read/write/run, invalid JSON/body/type, missing/foreign Origin, 429, 409 no-overwrite, pre/post-stream failures, pinned policy, and disconnect abort.
- [ ] Provider wrapper selects model and max output on the server. Expose production composition via dependency injection; no demo token/password verifier in the production app.

### Framework clients and transport

Files: `react/src/ServerConversations.tsx`, `angular/src/app/server-conversations.ts`, and `server-history.ts` in both source folders. Tests `www/test/docs/server-history.spec.ts` and browser cases in `www/src/tools/record-docs-production.ts`.

- [ ] Write transport shape/conflict tests, run the focused www test and observe red; implement validated GET/PUT helpers with same-origin credentials, encoded IDs, version checks, AbortSignal support and typed conflict errors.
- [ ] Client supports Personal/Work selection, async load before chat mount, keyed fresh runtime, save only completed text, serialized saves, visible save/load/conflict errors, explicit Reload saved conversation action. Preserve messages after save failure; don't mark a failed save as saved.
- [ ] Browser tests for both frameworks: refresh and switch; delayed initial load ignored after selection changes; delayed save cannot overwrite new selection; save failure retains visible exchange; complete saves are serialized; conflict then explicit reload preserves server winner. Prefer disabling switches while a save is active if that avoids unnecessary concurrent state.

### QuickJS example

Files: `react/src/RuntimeDemo.tsx`, `angular/src/app/runtime-demo.ts`, shared `www/examples/quickstart/runtime/basket.ts`; tests `www/test/docs/runtime-basket.spec.ts` and actual browser QuickJS cases in recorder.

- [ ] Write failing host validation tests before implementation. Explicitly reject invalid host function arguments; schemas currently supply descriptions/type guidance, not automatic bridge enforcement.
- [ ] Run real QuickJS through public framework runtime APIs. Show code and result/error wrapper, valid calculation, unavailable `document`/`fetch` or invalid host arguments, then successful recovery. Test reset context and infinite-loop interruption separately from the main recording. Exposed host functions retain host privileges and require validation/authorization.
- [ ] Rewrite both Runtime guides using the checked complete files, practical result, real return wrapper and tool integration. Do not promise persistent contexts or hard resource/security guarantees absent from source.

### Recorder, docs, and release

Files: `www/src/tools/record-docs-production.ts`, `www/project.json`, demo catalog, existing Public endpoint/Threads/Runtime docs in both SDKs, media inventory and examples README; guide tests `www/test/docs/production-guides.spec.tsx`.

- [ ] Create `docs-production-demo` Nx target: compile tsconfig.record, then run recorder. Static Vite clients avoid HMR. All server/identity/provider fixtures are local and disclosed. Full-screen screenshots only during video, crop PNG after capture, preserve all interaction footage.
- [ ] Write media/snippet tests first, observe missing IDs/files, then implement catalog, complete guides and encode assets. Capture proof of 401→authorized response and owner rejection, server refresh/switch with conflict recovery, and actual QuickJS computation/error/recovery.
- [ ] Run `NX_DAEMON=false npx nx typecheck www`, `test www`, `lint www`, `build www`, `e2e www` sequentially. Expect all clean other than existing build-tool warnings. Inspect videos/posters/contact sheets; verify live-like built pages and mobile/scroll behavior.
- [ ] Source/spec review, commit and PR (no assistant names), attach PR, merge verified head only after all CI gates are green, then verify production deployment and public pages.

## Runtime deadline correction found during browser verification

The real Chromium sequence passed normal QuickJS execution, browser-global failure, invalid host arguments, and successful retry. A tight synchronous loop then blocked the browser for the entire Playwright timeout: the interrupt callback read an AbortSignal whose timer could not run while synchronous WASM occupied the event loop. Correct that internal deadline check with an isolated, externally bounded real-QuickJS regression test before recording. No API or dependency change. Explain cooperative caller cancellation and host limits accurately. This adds required core build/test/lint checks, focused runtime regression evidence, and source review to the final gate.

## Verification evidence

Both framework runs passed all three main cases plus serialized saves, failed-save preservation, a real version conflict/reload, stale-load guards, fresh QuickJS contexts, infinite-loop deadline interruption, and recovery. Final MP4/WebM media, captions, transcripts, posters, and useful screenshots were visually reviewed. The access recording displays actual HTTP status/events and clears prior response text while waiting. Source review approved the endpoint, store, clients, recorder, runtime boundary prose, and monotonic deadline change. Full core/www checks are the remaining local gate before PR.

Final local gate passed: core build, 1,555 tests in 79 suites (14 snapshots), five built-package e2e checks, and lint (three pre-existing tool-step unused-variable warnings). Website strict examples, 676 tests in 101 files, lint, fresh production build, 99/99 docs route coverage, all custom elements, and 471/471 OG pages pass. Built desktop/mobile review passed for the six guide variants, including complete-source disclosures, native video playback, independent scroll regions, and closed Migrations. The stale local SDK was restored to the lockfile's 0.15.0 using an integrity-verified tarball; no dependency declarations changed. Existing Nx/API Extractor/Next build warnings remain. PR and deployment verification follow this local gate.
