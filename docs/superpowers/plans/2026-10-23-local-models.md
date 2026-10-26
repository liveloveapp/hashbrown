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

### Initial localhost findings before provider fixes

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

## Verification of the merged implementation

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

## Follow-up report appendix (2026-10-23)

The original implementation merged as
[#726](https://github.com/liveloveapp/hashbrown/pull/726), commit `e2ddec03`.
The results below cover subsequent provider fixes and additional local
experiments. Their validation is separate from the merged implementation's
verification above; current follow-up package checks are recorded below.
The [reviewed browser tools and multimodal design](../specs/2026-10-23-browser-local-capabilities-design.md)
records the proposed direction without shipping a new browser capability API.

### Expanded WebLLM model and schema matrix

Reports `/tmp/hashbrown-model-matrix/0.5B.json` and
`/tmp/hashbrown-model-matrix/1.5B.json` each record six passing browser cases,
zero skipped/unexpected/flaky cases, across Angular and React. The selection
covers structured output and nested trusted UI, a schema-depth sweep, and
selection from larger UI schemas. It does not rerun Stop/truncation recovery
for each model. The initial 3B report,
`/tmp/hashbrown-model-matrix/3B.json`, records four passing cases and two failing
depth-sweep cases, with no skipped/flaky cases. Across these three reports the
result is 16 passed and two failed, not an all-passing 18-case matrix.

All three models are `Qwen2.5-<size>-Instruct-q4f16_1-MLC` on WebLLM 0.2.85. These
runs use a 1,024-token budget, unlike the earlier 256-token suite. Hardware is
still only the Apple M1 Max/32 GB machine described above, using Chrome 155 and
the Apple Metal WebGPU adapter. No Windows, Linux, discrete-GPU, mobile or
lower-memory hardware result is established.

| Model |              Cases | Structured engine load, Angular / React | Depth 32 TTFT / total, Angular | Depth 32 TTFT / total, React | Width 32 TTFT / total, Angular | Width 32 TTFT / total, React |
| ----- | -----------------: | --------------------------------------: | -----------------------------: | ---------------------------: | -----------------------------: | ---------------------------: |
| 0.5B  |           6 passed |                           6.86 / 6.69 s |                  57 / 2,767 ms |                58 / 2,458 ms |                    87 / 498 ms |                  82 / 509 ms |
| 1.5B  |           6 passed |                         17.77 / 18.43 s |                 102 / 3,858 ms |                93 / 3,717 ms |                   121 / 691 ms |                 121 / 714 ms |
| 3B    | 4 passed, 2 failed |                         85.45 / 33.14 s |                    Not reached |                  Not reached |                 179 / 1,035 ms |               192 / 1,020 ms |

For 0.5B and 1.5B, depths 1, 4, 8, 16 and 32 passed exact parsed-output checks, with schemas from
119 to 2,940 bytes and a terminal integer constant of 2. Widths 4, 16 and 32
passed requested component-selection checks for all three models; the largest schema is 12,095
bytes and selects `status31` with the requested title/count. These sweeps are
engine-level constrained-output experiments. The structured/nested-UI case
separately exercises Hashbrown rendering; the width sweep does not demonstrate
rendering a 32-component application or unconstrained selection quality.

Depth/width rows are later requests in their respective loaded-engine sweeps;
their timings exclude engine loading. Different whitespace/output lengths,
cache state and system contention prevent treating these samples as a model
ranking, scaling law, maximum schema size or latency guarantee. Catalog VRAM
estimates for 0.5B and 1.5B are 944.62 MB and 1,629.75 MB respectively, not measured GPU memory.
Aggregate process RSS retains the shared-page caveat above. Broader semantic
quality and cross-hardware testing remain open.

The 3B model passed depths 1 and 4, then consumed its 1,024-token budget at
depth 8: both frameworks recorded `finishReason: "length"`, 3,352 output
characters and approximately 36.60/37.01 s total generation. The output reached
the terminal integer but continued with whitespace before closing the JSON;
`JSON.parse` failed at position 3,352. The sweep stopped there, so depths 16 and
32 were not reached in this report. The larger model did not complete this case that
the two smaller models completed; size alone does not establish constrained
generation quality or reliable termination.

The separate 2,048-token retry in
`/tmp/hashbrown-model-matrix/3B-2048.json` still failed both aggregate depth
cases because depth 8 exhausted the larger budget, producing 6,673 characters
of invalid JSON. Unlike the initial sweep, this capture continued to depth 32:
both depth-32 requests stopped normally, and independently comparing the raw
attachment's parsed output to its expected value confirmed an exact match.
The Playwright assertion loop stopped at depth 8 and did not assert depth 32.

| Project | Depth 8 TTFT / total | Depth 8 finish | Depth 32 TTFT / total | Depth 32 finish      |
| ------- | -------------------: | -------------- | --------------------: | -------------------- |
| Angular |   3,379 / 117,292 ms | `length`       |        279 / 4,600 ms | `stop`, exact output |
| React   |   3,145 / 114,000 ms | `length`       |        200 / 3,913 ms | `stop`, exact output |

The retry contains two failed tests, not two successful depth sweeps; the
matching captured depth-32 outputs are narrower evidence inside those failed cases.
Doubling the budget did not resolve depth-8 whitespace/termination behavior.
The depth-32 successes also rule out interpreting this failure as a monotonic
schema-depth ceiling. Timing and exact-output findings remain specific to
these inputs, runtime/model and hardware.

### Ollama after targeted provider fixes

`/tmp/hashbrown-ollama-after-fixes.json` repeats the direct adapter probes with
Ollama 0.35.0 and `qwen2.5:14b`. Native cancellation now races pending response
setup and forwards the run's signal to the owned HTTP client. With abort at
409 ms, the iterator settled at **504 ms**, compared with **26.50 s** before
the fix. The subsequent request completed in 797 ms. Only `RUN_STARTED` was
emitted by the cancelled run. This measures observable adapter settlement,
not the exact instant of GPU/model shutdown. The Responses route settled at
441 ms after abort at 401 ms; its next request completed in 517 ms.

Two independent lookup calls and manual replay again returned both exact
tokens on both routes. This validates distinct call IDs and result mapping,
not simultaneous handler execution or automatic framework tool orchestration.
The native five-token tool limit still yields `finishReason: "length"` with no
executable tool. The Responses five-token case still yields `RUN_ERROR`,
`rsp.output is not iterable`, with no executable tool: the upstream terminal
payload has `output: null`, which the OpenAI SDK cannot accumulate. Handling a
well-formed incomplete Responses event in Hashbrown does not repair this
upstream payload or turn this live probe into a successful truncation result.

Schema-plus-tools remains a semantic limitation for this model/runtime pair:
both routes accept the request but return `{"token":"unknown"}` without the
requested lookup. Structural JSON validity is not tool-use success. The loaded
model was unloaded after the probes. No broader model/runtime compatibility
claim follows from these single samples.

### Raw native browser image and capability probes

`/tmp/hashbrown-native-capabilities-followup.json` records a native Chrome
155.0.8059.85 session against the dedicated test profile. A generated 64-by-64
red canvas, prompted for its dominant color, produced `Red`. Session setup
took 20.89 s; generation took 2.18 s; total was 23.07 s. This establishes one
synthetic-image native inference case, outside Hashbrown. Audio availability
returned `available`; no audio capture or inference was performed.

Tool-call/tool-response enum combinations also returned `available`, but a
getter probe showed that `availability()` did not read the `tools` dictionary
member. `LanguageModelToolCall`, `LanguageModelToolSuccess` and
`LanguageModelToolError` were all absent. An invalid-modality control did throw
`TypeError`, so accepted enum values alone must not be interpreted as a working
tool interface. No native tool execution was attempted or established. Sessions
and the browser context were closed afterward; no personal profile was used.

The current Hashbrown browser transports continue rejecting tools and media.
The linked design requires exact capability negotiation and a real typed-tool
round trip before future support can be claimed. These raw browser experiments
do not validate a Hashbrown image/audio adapter.

The subsequent native target passed both framework projects, retaining
`native-runtime-capabilities.json` attachments in
`test-results/conformance/local-models/native-report.json`. Both returned the
exact answer `Red` and recorded `sessionDestroyed: true`.

| Project | Session setup | Generation |   Total |
| ------- | ------------: | ---------: | ------: |
| Angular |       18.79 s |     2.20 s | 21.00 s |
| React   |       14.63 s |     3.29 s | 17.93 s |

These are native API canaries launched from each framework project, not a
Hashbrown multimodal rendering or media-transport test. They confirm the same
missing tool constructors and unread `tools` dictionary member as the raw
probe; audio remains availability-only.

### Retained local-provider target results

`test-results/conformance/local-models/provider-report.json` records eight
ordinary passes plus two expected semantic failures for schema-plus-tools,
one per adapter. Playwright reports ten expected outcomes and zero unexpected
outcomes; its successful suite summary does not mean ten capability successes.
The two known-failure cases still produce `{"token":"unknown"}` without the
required lookup. The other cases cover adversarial schema enforcement, two
independent calls and result replay, non-executable truncated tools, and
cancellation followed by recovery.

In this retained run, native abort occurred at 411 ms and iteration settled at
430 ms; Responses abort occurred at 408 ms and settled at 466 ms. These are
additional single observations after the earlier 504 ms native settlement,
with the same model/version and adapter-level scope. The Responses truncated
tool case verifies safe failure with no executable call, while retaining the
upstream `output: null`/SDK `RUN_ERROR` limitation above. No successful tool
completion is inferred from that safety assertion. Ollama was unloaded after
the run.

### Follow-up package and test-selection verification

Build, test and lint passed for the affected OpenAI, Ollama and conformance
packages: 80 OpenAI tests, 37 Ollama tests and 45 conformance tests, 162 in total.
The existing OpenAI lint warning from `@nx/dependency-checks` about the
`@ag-ui/core` dependency manifest remains, alongside the build-tool deprecation
warnings. The new local-provider suite's CI guard was verified to reject CI;
the standard browser-suite listing remains 72 cases and excludes local suites.
Conformance build/lint and its 45 tests passed again after raw depth-output
capture and explicit finish-reason assertions were added.
These package checks do not negate the two measured 3B depth-sweep failures or
the live upstream Responses truncation error. The larger-budget 3B retry above
also retains two failing tests. The standard browser suite passed all 72 cases
in the final sequential rerun (1.9 minutes), recorded in
`/tmp/hashbrown-standard-e2e-sequential.log`. The aimock local contracts passed
all 24 cases, recorded in `/tmp/hashbrown-aimock-final.log`. The default WebLLM
rerun passed all eight cases in 86.23 seconds, using the 0.5B model, a 256-token
budget, strict normal-finish assertions and portable Nx mode configuration.
It covers structured/nested UI rendering, Stop/truncation recovery and retry,
depth sweeps and larger-schema component selection across both frameworks.
Results are retained in `/tmp/hashbrown-webllm-default-final.log` and
`test-results/conformance/local-models/webllm-report.json` (eight expected,
zero unexpected outcomes). These passing default-model cases remain separate
from the recorded 3B depth failures and expected localhost semantic failures.

An initial standard-suite attempt timed out during concurrent alternate-port
server startup before any test ran; the sequential rerun resolved it without a
source change. No further 3B GPU experiments are planned for this report. Local
target mode variables now use Nx's portable `env` configuration, and the
[conformance instructions](../../../tools/conformance/README.md) include a
PowerShell invocation. These configuration/documentation changes have not
been verified on Windows hardware.
