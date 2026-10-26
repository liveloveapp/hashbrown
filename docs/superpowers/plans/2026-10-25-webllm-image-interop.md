# WebLLM Image Interop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Parent chat reviews this plan before code and arranges spec/quality review.

**Goal:** Add dependency-free, explicitly enabled, bounded user images to the application-owned WebLLM transport while retaining its default string contract.

**Architecture:** Synchronous whole-history preflight precedes acquisition. Claim shared engine ownership before image preparation inside local stream start with its composed cancellation signal. Generate canonical data URLs from validated application-resolved blobs and retain the existing generation interrupt/drain behavior.

**Tech Stack:** Existing TypeScript, AG-UI, browser Blob/createImageBitmap, Jest, Nx, Playwright. No new dependencies, model/runtime downloads or GPU/native inference.

**Spec:** `docs/superpowers/specs/2026-10-25-webllm-image-interop-design.md`.
**Isolation:** `/Users/blove/.codex/worktrees/webllm-images/hashbrown`, branch `blove/webllm-image-interop`, starting `origin/main`. Browser contracts use 4451/4452, never parent profile/ports/GPU.

## Fixed design

- Request/engine gain `TUserContent = string`; only user content is generic, system/assistant remain strings, request arrays mutable. `WebLlmImageContent` is string or mutable text/image_url array; image_url has url only.
- Legacy options gain `media?:never`. Image overload requires a function-valued create property accepting image requests, preventing method bivariance and variable overload loopholes. No compatibility casts/any.
- New WebLLM resource/resolver/policy/media/options types have TSDoc; no ChromePrompt names in public WebLLM signatures, third-party production imports or new internal public exports.
- Defaults: 10 MiB/image, 16M pixels/image, 8 images/run, 20 MiB/run. Bounds are finite positive safe integers.
- Preflight entire history before resource calls: only user arrays; image prefix followed by optional text parts; trailing text joins exactly with `join('')`; image-only valid, text-only arrays become strings, empty arrays invalid. Even empty text prohibits later images. Reject other roles, tools/tool history, audio/video/unknown parts.
- Nonempty data/url/file sources; canonical raw base64 for inline data, predecode length bounds, optional supported declared MIME matching Blob. PNG/JPEG/WebP only. Every image uses app resolver; no original source passthrough/fetch/transcode/resize/object URL.
- Validate nonempty supported Blob and byte limits before reads, use temporary bitmap for positive safe-integer width/height/product and maxPixels then close immediately. Decoder allocation precedes dimension check; no stronger transient-memory claim. Chunk base64 encoding without whole-buffer spread.
- Resolver/decode late results dispose once, register cleanup before abort checks, contain rejected cleanup promises. Preparation cancellation releases ownership promptly and never interrupts engine; once create begins existing interrupt+drain retains lock until done. Clear request/base64 references after generation/drain.
- Small private helper extraction from Chrome only if justified; retain Chrome names, behavior and bounds. Avoid sharing if it broadens changes.

## File map

- Modify `packages/core/src/transport/experimental-webllm-transport.ts`: types/overloads, preflight integration, preparation lifecycle and drain ownership.
- Create `packages/core/src/transport/webllm-image-media.ts`: private image preflight, limits, resolution, decode, canonical encoding and cleanup. Re-export public WebLLM types through existing transport barrel only as necessary.
- Create `packages/core/src/transport/experimental-webllm-image-transport.spec.ts`: top-level AAA behavior/race tests.
- Create compile controls alongside existing core specs for generic defaults/overload rejection; actual .85/.86 archive consumer fixture is external qualification, not a repo dependency.
- Update `packages/core/etc/core.api.md` through API report.
- Create `tools/conformance/local-models/webllm-images.e2e.ts` plus deterministic worker shim, `tools/conformance/local-webllm-images.playwright.config.ts`; modify `tools/conformance/project.json` with opt-in image contract target.
- Modify both `tools/conformance/hosts/{angular,react}/src/local-transport.ts` for explicit WebLLM image mode and application resolver. Image generation order changes only for WebLLM mode; preserve native fixture behavior.
- Inspect `tools/conformance/local-models/webllm-runtime.ts` metrics and sanitize if needed: never serialize image bytes/data URLs. Document contracts and qualification limits in `tools/conformance/README.md`.

### Task 1: Baseline and strict API contracts

- [ ] Install existing locked dependencies with `npm ci --ignore-scripts --no-audit --no-fund`; verify package.json/lock unchanged.
- [ ] Run `NX_DAEMON=false NX_NO_CLOUD=true NODE_ENV=test npx nx test core --runInBand --testPathPatterns=experimental-webllm-transport` and record baseline.
- [ ] Add failing compile controls: default content remains string; image engine accepts image content; system/assistant remain string; legacy text engine plus media rejects literal AND variable. Observe failure before public type changes.
- [ ] Add defaulted role-discriminated request/engine and strict image overload; preserve legacy method compatibility and add media?:never.
- [ ] Run focused tests and strict consumer check against actual .85/.86 MLCEngine, WebWorkerMLCEngine, MLCEngineInterface from `/tmp/hashbrown-webllm-types/{085,086}/package` using final exported types; no casts/ambient replacements. With skipLibCheck expect pass; record upstream missing declarations without skip separately.
- [ ] Commit coherent tested public type/contract changes.

### Task 2: Whole-history preflight and exact mapping

- [ ] Write failing tests for multi-image/multi-turn images before text, exact adjacent text concatenation, image-only/text-only arrays, canonical data URL, no detail/source passthrough.
- [ ] Write failing rejection tests for disabled media/non-user arrays/empty arrays/text-image/image-text-image/empty-text-image/audio/video/unknown/tools/tool history. Assert a later invalid history item prevents all resolver/decode/create calls.
- [ ] Add malformed/empty source/type, unsupported declared MIME, data URI, noncanonical/invalid/oversized base64 and nonstring text tests. Run focused core tests and confirm expected RED.
- [ ] Implement pure preflight with validated limits and full-history count, preserving instructions join and response schema mapping. Implement minimal image preparation mapping. Run new and existing WebLLM tests GREEN.

### Task 3: Bounded resource preparation

- [ ] Add failing tests for all default/custom bytes/pixels/total/count bounds; zero/negative/fractional/NaN/infinite/unsafe policy values; invalid/empty Blob; unsupported/mismatched MIME; unavailable/rejected decode; invalid dimension/product.
- [ ] Assert byte limits and decode checks precede Blob reads. Spy on fetch: no calls. Assert canonical output contains resolved bytes even when input source differs. Run RED.
- [ ] Implement sequential abort-raced resolution with once-only cleanup registered before cancellation checks, bounded Blob validation and aggregate bytes, temporary decode/close, then bounded chunked encoding. Run GREEN.

### Task 4: Cancellation, late acquisition and shared ownership

- [ ] Add failing caller-abort and dispose-only tests for pending resolver, decode and Blob read: prompt settlement, immediate engine reuse before generation, no interrupt/create, late cleanup once.
- [ ] Add failing sync resolver throw, second-image failure cleanup, cleanup rejection containment, image/image and image/text overlap, failure recovery tests.
- [ ] Add generation regressions for pending worker create, iteration and drain cancellation: interrupt once, hold lock until done, never unload/resetChat, preserve truncation and eventual reuse. Run RED.
- [ ] Claim active engine after synchronous preflight and before async preparation. Prepare inside local start(signal), separate preparation from generation pending; promptly release preparation on cancellation, preserve existing generation drain lock and safe resource disposal. Clear base64/prepared references after drain. Run new tests and existing local ownership suites GREEN.
- [ ] Commit coherent core implementation/tests.

### Task 5: Deterministic browser worker contracts

- [ ] Add failing config gate tests and browser image contracts with generated PNG and app resolver in Angular+React. Assert actual browser decode, canonical image-before-text serializable worker request, text response and disposal.
- [ ] Add worker setup/drain cancellation and overlap contract. Shim uses structured clone, deterministic stream protocol, metadata-only reporting; never imports/loads WebLLM, model or GPU.
- [ ] Run RED before host/config behavior. Add `local-webllm-image-contract-e2e`, require `LOCAL_LLM_WEBLLM_IMAGES=1`, `LOCAL_LLM_E2E=1`, refuse CI; separate from default smoke/CI targets.
- [ ] Enable explicit localModel=webllm&localMedia=image with strict image engine and app inline resolver. Only this mode generates image prefix then text; existing native fixture behavior retained.
- [ ] Run GREEN on ports 4451/4452 and existing deterministic text/media/schema/UI contracts. Document commands, constraints, app ownership and qualification boundary; commit.

### Task 6: Full verification and parent handoff

All Nx commands use `NX_DAEMON=false NX_NO_CLOUD=true`; unit/core/conformance use `NODE_ENV=test`; host builds use `NODE_ENV=production`. Browser commands also use `RUNTIME_SMOKE_ANGULAR_PORT=4451 RUNTIME_SMOKE_REACT_PORT=4452 LOCAL_LLM_E2E=1`.

- [ ] `npx nx build core`; `npx nx test core --runInBand`; `npx nx lint core`; `npx nx build-api-report core`. Review API report for accidental internal exports/Chrome names.
- [ ] `npx nx build conformance`; `npx nx test conformance --runInBand`; `npx nx lint conformance`.
- [ ] `npx nx build runtime-smoke-angular`; `npx nx build runtime-smoke-react`; both host lint targets. No host unit target exists; browser contracts exercise behavior.
- [ ] `LOCAL_LLM_WEBLLM_IMAGES=1 npx nx local-webllm-image-contract-e2e conformance`; `npx nx local-model-contract-e2e conformance`; `npx nx local-media-contract-e2e conformance`; `npx nx local-native-schema-contract-e2e conformance`; `npx nx local-native-ui-contract-e2e conformance`.
- [ ] Repeat actual .85/.86 strict consumer check against final exported types, record skipLibCheck/full-check caveat and reproducible archive command.
- [ ] `git diff --check`; inspect manifests/changed files, ensure no payload logs or model downloads. Parent spec/quality reviews; regression tests first for fixes. Commit final work, send exact paths/commits/tests/warnings. Do not push/create external PR.

## Evidence limits

Actual declaration checks establish structural assignability, with upstream declaration-body caveat. Mocked browser/worker contracts establish mapping and lifecycle. Neither proves real WebLLM vision runtime/model image capability, inference quality, memory requirements or cross-hardware reliability. Real VLM qualification remains a later explicit model/download decision.
