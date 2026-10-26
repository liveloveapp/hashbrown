# Local model capabilities implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans task by task. User authorizes implementation, PRs, merge on green and verification; exclude cross-hardware work.

**Goal:** Add verifiable browser media input, end-to-end local provider workflows and precise Responses protocol failures, while keeping native typed tools gated on a real supported-browser round trip.

**Architecture:** Follow the reviewed browser capability design. Keep the current text-only default and application-owned WebLLM. Extend experimental Chrome with explicit media policy and an application resolver; translate AG-UI user image/audio parts into native parts with bounded validation, exact modality negotiation and per-run cleanup. Keep native tools unsupported until the installed browser provides a working typed interface. Exercise localhost adapters through actual framework tool execution rather than manufactured replay. Consume raw Responses events so protocol validation happens before SDK accumulation can obscure malformed output.

**Tech Stack:** Existing TypeScript, AG-UI, Chrome Prompt API, OpenAI/Ollama SDKs, Nx/Jest/Playwright/aimock; installed macOS speech synthesis and ffmpeg for a synthetic WAV fixture. No dependency installation, hardware expansion or personal inputs.

## Task 1: Browser image input and resource ownership

Files: `packages/core/src/transport/chrome-prompt-media.ts` and spec; `experimental-chrome-local-transport.ts` and spec; transport exports/API report; local conformance media fixtures/tests.

- [x] Write failing tests for explicit opt-in, part order/text translation, user-role-only media, tool/video/document rejection, source/MIME/size/decoded-image bounds, exact availability/create input modalities and session identity.
- [x] Write failing lifecycle tests for partial resolution, resolver rejection, late resolver/decode after abort, availability/create failure, stream failure, cancellation and successful completion. Every acquired resource must be released once; application-owned resources have only explicit disposer callbacks.
- [x] Add public TSDoc types for a resolver receiving AG-UI image/audio parts plus the run signal and returning an encoded Blob with an optional disposer. Media input types and byte/pixel/duration policies are explicit; do not fetch URL/file sources or infer file handles as URLs.
- [x] Resolve sequentially; validate inline base64 and encoded MIME/size; decode images with owned ImageBitmaps before creating the native session. Keep media values out of session identity. Preserve the default text-only contract and existing system/schema handling.
- [x] Require explicit native input modalities matching the request and text output. Reject media plus a custom transform unless ownership/validation is supported explicitly; never silently discard content.
- [x] Run focused red/green tests, then local aimock contract tests and a real generated-image canary through Hashbrown in both frameworks.

## Task 2: Actual audio inference and bounded encoded-audio input

Files: synthetic fixture/metadata under `tools/conformance/local-models/fixtures/`; native/media local tests; core media helper/spec if inference succeeds.

- [x] Generate a short fixed spoken phrase using installed offline macOS speech synthesis; convert to mono PCM16 WAV with ffmpeg. Retain generation command, phrase, sample rate, duration and SHA-256. No microphone or user files.
- [x] Add a separately opted-in native audio canary using exact text/audio availability, click activation, bounded create/prompt signals and cleanup before publishing its result. Require transcription semantics; a sine wave or availability response is insufficient.
- [x] If actual inference succeeds, write failing tests and enable encoded PCM WAV input behind a separate explicit audio policy: bounded total bytes, decoded duration, channels/sample rate and truncation checks. Preserve encoding without implicit resampling; no raw PCM guessing.
- [x] Verify the fixture through the real Hashbrown transport and both framework hosts. Unsupported audio remains explicitly unverified rather than a passing test.

## Task 3: Real local-provider framework workflows

Files: new local workflow route/config/spec; opt-in workflow fixtures in both runtime smoke hosts; conformance project/tsconfig/README.

- [x] Add failing deterministic aimock-backed workflow tests, then wire opt-in tools/fixtures. Preserve ordinary smoke scenarios.
- [x] Exercise independent and dependent tools, approval/denial before protected side effects, actual automatic result replay, second-turn history and final rendered output in React and Angular. Label app-owned permission gates accurately; do not claim a new framework authorization API.
- [x] Use a loopback-only Express AG-UI SSE route with the real Ollama/OpenAI adapters, bounded tokens/request counts/deadlines and actual browser-provided history. Capture provider request/event/operation evidence in finally.
- [x] Add opt-in local live tests for the installed model only. Keep schema-plus-tools as a semantic golden, do not silently remove schemas/tools or infer UI success from valid JSON. If the live model fails, report its exact semantic limitation without masking transport/framework failures.
- [x] Keep all live targets non-cacheable, CI-rejecting and outside normal test discovery. Run GPU suites sequentially.

## Task 4: Responses protocol validation and upstream tracking

Files: `packages/openai/src/stream/text.fn.ts`, `openai-events.ts` where appropriate, SDK/HTTP specs, local provider expectations and research report.

- [x] Add failing HTTP regressions for null/missing/object terminal output, a valid empty completed response, valid empty incomplete response, partial tool arguments followed by malformed completion and caller cancellation.
- [x] Consume `responses.create({...request, stream: true})` raw events using the existing SDK rather than its accumulating helper. Preserve cancellation/cleanup and reject malformed terminal output with a clear provider-protocol error. Never infer length from token counts or normalize null into success.
- [x] Update SDK-boundary unit tests and run OpenAI build/test/lint (89 passing tests); installed-provider checks record 10 expected outcomes, including two expected semantic failures.
- [x] Complete standard provider/browser execution: all 72 combined conformance cases passed in the final standalone run.
- [x] Track both upstream defects separately: malformed empty output and incorrect completion status. Link the existing Ollama truncation PR #17239 and pinned/current source. No external issue/comment is sent without authorization.

## Task 5: Capability gates, review, release and verification

- [x] Reprobe native typed-tool constructor/declaration recognition with normal Chrome test settings. Do not expose or ship a speculative native tool transport when the real round trip is unavailable. Record the exact blocker for any later question.
- [x] Update React/Angular recipes, local commands and the research/design status to distinguish shipped adapter support, raw runtime canaries and unverified capabilities. Keep WebLLM dependency-free and local tests outside CI.
- [x] Run affected build/test/lint and core API checks, standard conformance, aimock contracts and available local suites; retain existing warnings and the independently verified live-model receipt-copy failures.
- [x] Request independent review and address findings: transports, workflows and canonical multipart lowering approved.
- [x] Commit and create/attach a PR, update against main without bypassing checks, merge on green and verify GitHub merge status and resulting source/CI. Continue remaining feasible work until a concrete user decision is required.

## Verification recorded

- Real native Hashbrown media: four Angular/React image/audio cases passed, with
  one resolution/disposal and one session creation/destruction per run.
- Package tests: core 1,665 (84 suites), Angular 272, React 204, OpenAI 89,
  conformance 45 and www 698 passed; affected builds/lint/API checks passed with
  existing warnings retained. Rebase onto `origin/main` at `e1076dff` had no conflicts.
- Final standard browser suite: 72 passed; deterministic workflows: 10 passed;
  existing aimock local transport contracts: 24 passed. Local files remain
  excluded from standard discovery. Initial startup/nested-Nx batching failures
  occurred before tests; final evidence comes from standalone/sequential runs.
- Raw native audio target: two passed, exact 7429 transcription, active click
  and session destruction; native operation totals were Angular 22.823 seconds
  and React 24.270 seconds.
- Experimental native tool-interface target: two passed, both `downloadable`,
  constructors/declarations recognized; no creation/inference/download. Real
  typed inference requires a user decision to permit the v4 model download.
- Installed-provider suite: 10 expected outcomes, including two expected
  schema-plus-tools semantic failures; zero unexpected outcomes. Malformed
  terminal Responses output reports the precise provider-protocol `RUN_ERROR`.
- Live framework workflows: 12 passed, four expected schema-only/tool-skipping
  failures and four unexpected model receipt-copy failures. Independent review
  covered 20 cases/44 provider runs and correlated 36 canonical result replays:
  handler dependencies and provider inputs were correct; provider output changed
  `HB_RECEIPT_<uuid>` to `HB_RECEPT_<same uuid>`, faithfully rendered by the UI.
  No blanket expected-failure rule was added and no framework/protocol defect was found.
- PR #733 merged after green CI at `9b4ef137062e0fc9cc397fb0654b73d443384dd4`;
  merged tree and origin/main verification completed. Hardware item 4 remains
  excluded. The user authorized v4 on October 24; continue in the
  [native-tools plan](2026-10-24-chrome-native-tools.md).
