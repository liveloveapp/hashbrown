# Local model interoperability implementation plan

**Goal:** Repair native Prompt API compatibility and support application-owned WebLLM engines, with opt-in local browser tests excluded from CI.

**Architecture:** Keep the existing AG-UI transport boundary. Native browser transports initialize system instructions with the session and consume text deltas. A separate experimental WebLLM transport accepts an injected engine, translates JSON Schema into WebLLM's schema-string format, and uses the existing local text lifecycle. Hashbrown never imports or installs WebLLM. Applications own engine creation, model selection, workers, caches, and unloading.

**Scope:** Text, structured output and trusted UI; cancellation and disposal; availability and download events. Native tools, multimodal input, automatic hosted fallback, and cross-runtime model benchmarking remain follow-ups. Tests reject unsupported input rather than silently converting it.

## Task 1: Native browser contracts

Files: `packages/core/src/transport/experimental-chrome-local-transport.ts`, corresponding spec, and native local delegator specs as necessary.

- [x] Add failing regression tests for string availability, a monitor with normalized progress, system/developer initialization, German/French, and nontext rejection.
- [x] Run `npx nx test core --runInBand --testPathPatterns=experimental-chrome-local-transport.spec.ts` and confirm failures describe these contracts.
- [x] Normalize availability, attach download listeners, place system instructions in initialPrompts, and align supported text languages. Preserve legacy availability compatibility where cheap.
- [x] Run the focused tests and update old expectations that encode the obsolete browser contract.

## Task 2: Application-owned WebLLM

Files: new `packages/core/src/transport/experimental-webllm-transport.ts` and spec; `packages/core/src/transport/index.ts`.

- [x] Write failing tests for AG-UI identity and text events; response schema translation; tools and nontext rejection; engine failures; cancellation before generation and during a stalled read; disposal; caller-owned engine lifetime; concurrent use rejection.
- [x] Implement `experimental_webllm({ engine })` with structural types and no runtime import or dependency. The injected engine implements chat.completions.create and interruptGenerate. Reject unsupported inputs before invoking the engine. Keep it explicitly selected, outside the native local delegator.
- [x] Reuse local text stream cleanup; handle late completion setup after cancellation without orphaning its iterator. Only interrupt the generation owned by this transport, and never unload the caller's engine.
- [x] Run focused tests, then core build/test/lint and API report.

## Task 3: Local browser conformance

Files: `tools/conformance/local-models/`, a separate local Playwright config and Nx targets, both runtime-smoke hosts, and conformance TypeScript configuration.

- [x] Add aimock-backed browser tests that invoke real Hashbrown transports through spec-faithful LanguageModel/engine shims. Test text, structured output, trusted UI, unsupported tools and cancellation across Angular and React.
- [x] Run the tests before wiring host transport selection and confirm expected failures.
- [x] Add opt-in host transport selection and a shared test-only bridge. Aimock serves provider token fixtures; transport-produced AG-UI events remain under test.
- [x] Add a separate native smoke target using installed Chrome and its real LanguageModel. Require local opt-in, reject CI, and report unavailable models clearly. Never initiate model downloads without an explicit browser interaction.
- [x] Keep both suites outside existing e2e/test globs; verify CI's e2e and example-e2e targets do not select them.
- [x] Run conformance build/test/lint, both host build/lint targets, and the local contract e2e suite. Run real smoke to establish either inference success or an explicit availability limitation.

## Task 4: Documentation and final verification

Files: native local-model recipes for React/Angular and `tools/conformance/README.md`.

- [x] Document corrected browser prerequisites, application-owned WebLLM worker setup, schema and tool limitations, ownership/cancellation behavior, and exact local-only test commands.
- [x] Run build/test/lint for affected packages. Report target absence, existing warnings, and environment failures explicitly.
- [x] Review the diff for accidental dependencies, CI inclusion, old frame/model-spec APIs, and incomplete cleanup. Leave changes reviewable in this worktree.

## Initial verification results (before follow-ups)

Core build/test/lint passed (1581 tests). Conformance build/test/lint passed
(45 harness tests); both runtime-smoke hosts build and lint. The local contract
suite passed 20 browser cases across both frameworks and transports. The docs
site build/test/lint passed (564 tests). WebLLM 0.2.85 regular and worker engine
types assign to the injected engine contract without installing WebLLM.

Initial real Chrome smoke failed for both frameworks at availability:
`unavailable`. The follow-up diagnosed Playwright's disabled feature defaults;
restoring Chrome's broker enabled the subsequent download and successful native
inference documented below.

The existing CI Playwright configuration lists 72 tests with no local-model
files, and the local config rejects CI before discovery. Existing core unused
variable warnings, bundler size/deprecation warnings, and API Extractor baseline
and documentation warnings remain. No dependency manifest changed.

## Follow-up execution

- [x] Diagnose native Chrome broker/model eligibility using an isolated persistent profile; repair automation settings if needed and rerun native smoke.
- [x] Add an opt-in real WebLLM worker smoke suite that loads an application-provided runtime archive, exercises structured output and nested UI, and records load/first-token/total timings and clearly labeled memory observations.
- [x] Measure model quality and schema limits separately from schema validity; record exact runtime, model, browser and hardware.
- [x] Probe the installed Ollama model's native schema/tool lifecycle and Responses compatibility; research other runtime and multimodal/tool support using pinned primary sources.
- [x] Run affected build/test/lint and both deterministic and available native browser suites, review, commit on a feature branch, and create a replacement draft PR referencing #486.

## Runtime research and measured interoperability (2026-10-23)

This audit distinguishes browser-hosted inference, a server on localhost, and
OpenAI protocol compatibility. Supporting one does not establish the others.
Measurements below are single-device observations, not performance guarantees.
Device: Apple M1 Max, 32 GB unified memory, 32 GPU cores, macOS 26.5; installed
Chrome 155.0.8059.85 (arm64), revision 0e66b94549a8bd85f03fbdf189b752d6e7b63c32.

### Chrome native inference

The [shipped Prompt API guide](https://developer.chrome.com/docs/ai/prompt-api)
describes text, image and audio input, text output and JSON-schema constraints.
The October 16 [Prompt API draft](https://webmachinelearning.github.io/prompt-api/)
also describes experimental tools and typed output chunks. These require a new
capability-aware translation layer; the current Hashbrown text-stream adapter
intentionally rejects tool and multimodal requests. A draft interface is not
proof of shipping availability on a particular Chrome build.

Automation introduced an artificial eligibility failure. Playwright's default
`--disable-features` list includes `OptimizationHints`. Restoring normal feature
defaults changed this exact browser/profile from `unavailable` to `downloadable`,
without hardware overrides. Current Chromium source explains the dependency:
[service factory](https://raw.githubusercontent.com/chromium/chromium/main/chrome/browser/optimization_guide/optimization_guide_keyed_service_factory.cc),
[AI manager](https://raw.githubusercontent.com/chromium/chromium/main/chrome/browser/ai/ai_manager.cc),
and [error mapping](https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/modules/ai/exception_helpers.cc).
These source links track main, rather than the installed revision. The browser
experiment establishes the installed-build result; it does not isolate every
feature in the disabled list. The local native suite clears that list, permits
component updates/networking/field trials, and uses a dedicated persistent test
profile. No personal browser profile or device-eligibility override is needed.

### WebLLM, pinned to 0.2.85

Application injection supports a regular or worker engine without installing
WebLLM into Hashbrown. Actual worker inference ran with
`Qwen2.5-0.5B-Instruct-q4f16_1-MLC`. An initial standalone cold-load probe took
8.35 s to load, 2.04 s to first token and 2.67 s to finish 32 tokens. Its prompt
asked for an exact sentence, but the model produced an explanation instead.
Schema validity therefore must be assessed separately from instruction quality.
The catalog's 944.62 MB VRAM estimate is metadata, not measured allocation.

Pinned [request validation](https://raw.githubusercontent.com/mlc-ai/web-llm/v0.2.85/src/openai_api_protocols/chat_completion.ts)
and [model configuration](https://raw.githubusercontent.com/mlc-ai/web-llm/v0.2.85/src/config.ts)
show native tools limited to specific Hermes model IDs. Tools reject a custom
system prompt and custom response format; the final tool call is parsed only at
the end of a normally stopped generation. This conflicts with simply forwarding
Hashbrown's system/schema/tool contract. Vision uses appropriate image models;
`image_url.detail` is rejected. Audio support appearing in newer development
documentation is not present in this pinned release.

Runtime inspection also found that early iterator `return()` does not reliably
release WebLLM's generation lock, especially through the worker proxy. The
adapter must interrupt and drain the stream through `done`, retaining exclusive
ownership until draining completes. This matters for both Stop and token-limit
truncation, and needs a real-worker retry check in addition to unit coverage.

### Localhost runtimes

Actual Ollama 0.35.0 with `qwen2.5:14b` Q4_K_M (approximately 8.99 GB model)
accepted both native `format` and Responses `text.format`. With an adversarial
prompt requesting 999 and a schema requiring `count: 2`, both returned 2. Native
HTTP cold generation took 10.41 s including 9.77 s model load; the warm Responses
probe took 0.36 s. An image sent to this text-only model failed explicitly with
HTTP 400; this is a model-specific limitation.

Actual Hashbrown source adapters were then exercised against the same server:

| Adapter                             | Constrained schema | Tool call | Tool result replay |
| ----------------------------------- | -----------------: | --------: | -----------------: |
| Ollama native                       |             1.37 s |    1.23 s |             1.34 s |
| OpenAI Responses with local baseURL |             0.59 s |    2.08 s |             2.04 s |

Each produced canonical AG-UI events without `RUN_ERROR`, enforced the
conflicting schema constraint, closed one tool call and returned the exact
provided result token after manual history replay. These probes establish
adapter-level compatibility, not automatic framework tool execution, UI,
cancellation, truncation, parallel tools, or schema-plus-tools interoperability.
[Ollama's compatibility documentation](https://docs.ollama.com/api/openai-compatibility)
should still be checked per installed version and model.

[LM Studio](https://lmstudio.ai/docs/developer/openai-compat/responses) and
[llama.cpp](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)
also expose local APIs. Check Responses explicitly: Hashbrown's OpenAI adapter
uses Responses, so support for Chat Completions alone is insufficient.
[LM Studio tools](https://lmstudio.ai/docs/developer/openai-compat/tools) and
[llama.cpp function calling](https://github.com/ggml-org/llama.cpp/blob/master/docs/function-calling.md)
depend on model/template support. Neither runtime was installed or exercised
here. A recent [llama.cpp truncation report](https://github.com/ggml-org/llama.cpp/issues/30773)
is a regression-test candidate, not a reproduced Hashbrown defect.

### Opportunities and boundaries

1. Keep the dependency-free injected-engine contract. Document application-owned
   workers, model downloads, cancellation and disposal; maintain a pinned
   compatibility matrix as runtimes change.
2. Add native browser tool support only after detecting the shipped typed-tool
   interface and defining permission/execution/result translation. Text-only
   streaming must continue rejecting unsupported input explicitly.
3. Treat WebLLM tool support as a separate adapter mode with model/template and
   system/schema restrictions; the current transport does not promise it.
4. Add model-specific vision/audio adapters after defining input conversion,
   supported output types and cancellation. Do not infer modality support from
   an engine brand or an unpinned documentation page.
5. Expand localhost conformance around schema+tools, parallel tools, interrupted
   and truncated tool arguments, and automatic React/Angular tool execution.
6. Maintain semantic golden cases alongside schema acceptance, nested trusted
   UI and bounded schema-depth probes. Record load, first-token and full-response
   latency independently. Process RSS and catalog VRAM must be labeled separately;
   neither is a precise measurement of unique GPU allocations.

These are evaluated future directions, not claims that this change implements
native browser tools, multimodal support or additional runtime packages.

### WebLLM measurements from the complete worker suite

All six real-worker cases passed across Angular and React. Each UI scenario
runs twice on the same loaded engine; models are recreated between scenarios.
These are single observations with temperature 0, seed 1, maximum 256 tokens;
network caches, shader compilation and system contention affect the numbers.
The warm request also has a longer conversation than the first request, so
these are not controlled identical-input comparisons.

| Framework / schema | Schema bytes | Engine load | First request TTFT / total | Second request TTFT / total |
| ------------------ | -----------: | ----------: | -------------------------: | --------------------------: |
| Angular structured |          290 |      6.84 s |               436 / 622 ms |                 61 / 191 ms |
| Angular nested UI  |        1,450 |      1.12 s |             524 / 1,406 ms |                 70 / 941 ms |
| React structured   |          290 |      8.81 s |             959 / 1,149 ms |                 65 / 196 ms |
| React nested UI    |        1,450 |      1.21 s |             620 / 1,582 ms |                 68 / 895 ms |

The worker emits actual `abort`, then `length`, then `stop` finish reasons in
both recovery cases. Both frameworks subsequently render the requested valid
structured answer. This verifies the drain fix against the real worker, beyond
a mock iterator's behavior.

A bounded engine-level schema sweep accepted depths 1, 4 and 8 (119, 392 and
756 bytes). Each forced a nested integer constant of 2 despite the prompt
allowing 999 only if the schema permits it. Warm totals for depths 4 and 8 were
374–377 ms and 654–669 ms. This establishes tested lower bounds, not a maximum
supported depth, full JSON Schema compliance or practical performance for large
UI kits. The nested UI case independently verifies Hashbrown's generated schema
and actual rendering of a trusted parent/child component pair.

Aggregate browser RSS baseline was approximately 920–923 MiB; loaded samples
were approximately 1,358–1,942 MiB. RSS sums can double-count shared pages and do
not measure unique GPU allocation. The catalog separately estimates 944.62 MB
VRAM. Do not infer a memory ceiling or compare frameworks from these few samples.
The JSON reporter preserves measurements and generated text under
`test-results/conformance/local-models/webllm-report.json` on each local run.

The native suite reports Send-to-requested-rendered-answer and Send-to-idle
wall time separately. These include session creation, parsing and UI; they are
not raw first-token latency. A first model download has a separate 20 minute
opt-in budget. Avoid parallel suite runs against the same host target/profile.

### Additional localhost findings requiring targeted follow-up

Further direct adapter probes on the same Ollama/model pair reproduced:

| Case                                             | Native Ollama adapter                                       | OpenAI Responses adapter                                              |
| ------------------------------------------------ | ----------------------------------------------------------- | --------------------------------------------------------------------- |
| Response schema and tools together               | Returned `{"token":"unknown"}` without the requested lookup | Same semantic failure                                                 |
| Two independent lookups and manual result replay | Two distinct calls; both exact result tokens returned       | Same success                                                          |
| Tool generation limited to five output tokens    | Finished with `length`; no executable tool emitted          | `RUN_ERROR`, `rsp.output is not iterable`; no executable tool emitted |
| Abort signal at approximately 403 ms             | Iterator settled after 26.50 s                              | Iterator settled after 406 ms                                         |
| Request after cancellation                       | Completed                                                   | Completed                                                             |

The public `signal` option was supplied correctly. Delayed native generator
settlement does not establish when the model stopped; the root cause was not
isolated. These observations justify targeted provider regressions: cancellation
settlement, empty/truncated Responses output, and model-specific schema/tool
composition. They do not establish automatic framework execution or parallel
handler behavior. No additional provider behavior or dependency was changed in
this implementation. The model loaded for these probes was unloaded afterward.

### Verified native Chrome result

The real native suite passed both frameworks after the download completed.
`chrome://on-device-internals` reports `nano_v3_gpu_component` version
`2025.8.8.1141` Ready, `prompt_api` Available, and the alternative Gemma use cases
Pending Usage. This identifies the tested browser-managed component; it does
not establish that the draft tool interface or every manifest model is active.
The final download/session-ready attempt took 752.88 s (about 12.55 minutes).

Each framework made two actual requests, with different requested answer text:

| Framework | First requested answer / idle | Second requested answer / idle |
| --------- | ----------------------------: | -----------------------------: |
| Angular   |               20.03 / 20.08 s |                  1.42 / 1.43 s |
| React     |               17.44 / 17.45 s |                  0.81 / 0.82 s |

These are end-to-end wall times, not model TTFT. Each browser starts a fresh
session against already downloaded weights; the second request reuses it.
Native model-service and GPU memory may be outside the CDP-enumerated process
RSS, so these RSS observations must not be used to compare native and WebLLM
model footprints. All native benchmark requests used the dedicated profile
`/tmp/hashbrown-native-model-profile`, which can be reused via
`LOCAL_LLM_PROFILE` without another download.

## Final verification on current main

The branch was fast-forwarded to main `2b1e16da` without conflicts. Core
build/test/lint passes (1,586 tests, 80 suites). Conformance build/test/lint
passes (45 tests); both runtime-smoke hosts build and lint. Docs production
build/test/lint passes (676 tests). The real native suite passes two cases,
and the local suites verified 24 aimock cases and six real-worker cases.
The existing combined browser/provider suite passes 72 cases and excludes the
local files. The local config rejects CI before test discovery. Core API report
builds. No dependency manifest changed.

Transient parallel build attempts collided in generated package/docs output;
sequential reruns passed. A non-production environment also broke Next
prerendering; the explicit `NODE_ENV=production` build passed. These required
no source changes. Existing three unused-variable warnings in
`models/tool-step.ts`, Nx/Vite/Jest deprecations, bundle-size warnings and API
Extractor release/link/export warnings remain. Local model suites remain
explicit opt-in and are not added to CI.
