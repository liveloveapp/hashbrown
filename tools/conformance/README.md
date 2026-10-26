# Conformance suites

These suites protect the published Hashbrown packages. They run the same
scenarios against an Angular host and a React host, so both frameworks keep
the same streaming, tool calling, structured output and generative UI
behaviour. They are internal test infrastructure, not an example to copy.

The standard suites need no model credentials. Their responses come from aimock
or an independent AG-UI endpoint started by the test. The separately opted-in
local suites below can use actual installed browser or localhost models.

## Layout

- `hosts/angular` and `hosts/react`: the runtime smoke hosts (Nx projects
  `runtime-smoke-angular` and `runtime-smoke-react`). Each page picks a
  scenario from the query string.
- `harness`: the shared Playwright driver, aimock worker, AG-UI helpers and
  event gate. Its own unit tests are the `*.spec.ts` files beside it.
- `specs`: the browser conformance specs. Each one runs once per framework.
  `collection.spec.ts` checks that the production hosts send no growth
  collection requests and keep no `hashbrown.growth` storage.
- `provider`: native-provider checks. `native-ui.spec.ts` drives both hosts
  through the real OpenAI adapter and SSE transport with an aimock upstream.
  `routes.spec.ts` covers the Node and Worker route fixtures under Jest. A
  test-only `selectItem` tool verifies browser tool execution.
- `fixtures`: aimock fixtures used by the harness.

## Commands

```sh
npx nx build conformance            # type-check the suites
npx nx lint conformance
npx nx test conformance             # harness unit tests and provider routes
npx nx conformance-e2e conformance  # browser conformance specs
npx nx provider-e2e conformance     # native-provider checks
npx nx example-e2e conformance      # both, with one shared host lifecycle
```

The e2e targets build both hosts first. CI runs `example-e2e` through
`nx affected`.

## Local model suites

These suites require explicit local opt-in and refuse to run when `CI` is
set. Their files live outside the CI Playwright and Jest test globs. No local model target is included by `example-e2e`.

```sh
LOCAL_LLM_E2E=1 npx nx local-model-contract-e2e conformance
LOCAL_LLM_E2E=1 npx nx local-model-smoke conformance
```

The contract suite runs both Angular and React against the real Chrome and
WebLLM transports. Spec-faithful browser/engine shims obtain streaming tokens
from aimock's Chat Completions endpoint. AG-UI events are produced by the
transports under test. It covers text, structured output, trusted and nested UI, tool
rejection and cancellation. It does not validate model quality or native
schema compilation.

The smoke target launches installed Chrome with its real `LanguageModel`;
no shim or aimock is involved. An unavailable model fails with its availability
state instead of silently skipping or using HTTP. It uses an isolated test
profile, so the model state may differ from your normal Chrome profile.
`LOCAL_LLM_PROFILE` can select another dedicated test profile. Never point it at
an open or personal profile. The native launch restores normal Chrome feature
defaults because Playwright disables `OptimizationHints`, which Chrome's AI
broker needs. It also permits component updates and background networking.
Downloads are disabled by default. On an eligible device, explicitly set
`LOCAL_LLM_DOWNLOAD=1` to allow its Send click to trigger Chrome's model download.
Check `chrome://on-device-internals` for device and model eligibility.

A separate real WebLLM worker suite accepts an application-provided standalone
browser bundle. For example, unpack the pinned `@mlc-ai/web-llm@0.2.85` npm
archive outside this repository, then point at its `lib/index.js`:

```sh
LOCAL_LLM_E2E=1 WEBLLM_MODULE_PATH=/absolute/path/package/lib/index.js \
  npx nx local-webllm-smoke conformance
```

This opt-in downloads model artifacts into the isolated browser cache and runs
actual WebGPU inference. `WEBLLM_MODEL` overrides the default
`Qwen2.5-0.5B-Instruct-q4f16_1-MLC`. Hashbrown does not install or bundle WebLLM.
The suite checks structured output and nested UI across both frameworks and
attaches JSON load/first-token/total timings, schema sizes and process RSS.
Catalog VRAM estimates are labeled metadata; process RSS can count shared memory
more than once and does not measure unique GPU allocations. Tests use bounded,
application-owned generation settings. The default WebLLM contract remains string-only; image input requires the separate explicit opt-in below. Tools remain unsupported. Chrome native typed
tools have a separate experimental opt-in described below. Chrome media input has a separate explicit opt-in described below.

### Deterministic WebLLM image contracts

```sh
NX_DAEMON=false NX_NO_CLOUD=true NODE_ENV=production \
  LOCAL_LLM_E2E=1 LOCAL_LLM_WEBLLM_IMAGES=1 \
  RUNTIME_SMOKE_ANGULAR_PORT=4451 RUNTIME_SMOKE_REACT_PORT=4452 \
  npx nx local-webllm-image-contract-e2e conformance
```

This separate target refuses CI and requires both explicit local flags. It runs
Angular and React with a generated 64×64 PNG, application-owned resolver, real
browser decoding, and a deterministic worker shim. It checks image history,
canonical data URL serialization, streaming, cancellation during worker setup
and iteration, an early release during controlled slow decoding, draining,
and resolver disposal. Worker diagnostics contain only
image count, MIME, byte count and dimensions. The target loads no WebLLM bundle,
model, or native inference session, and does not validate model vision quality.
The existing `local-webllm-smoke` remains a separate text-only real-runtime test.

This image API requires this feature branch's source changes or a future SDK release; published
version 0.8.1 does not include it. Applications opt in with
`experimental_webllm({ engine, media: { images: {}, resolve } })`. The engine must accept `WebLlmRequest<WebLlmImageContent>`;
unparameterized `WebLlmRequest` and `WebLlmEngine` retain string user content.
Every image source is resolved by the application into `{ blob, dispose? }`,
including inline data, URLs and file handles. Hashbrown never fetches a source
or forwards its original URL/file value to WebLLM. It validates PNG/JPEG/WebP
bytes and decoding, then creates a canonical data URL. Temporary validation
bitmaps close immediately; application resources dispose after generation or
drain, with late acquisitions cleaned after cancellation.

Only user arrays containing images first and optional trailing text are
supported. Adjacent trailing text joins exactly, image order is preserved, and
text before an image or interleaving is rejected. Text-only arrays normalize to
a string in image mode; empty arrays, other media and tool histories are
rejected before resource acquisition. Defaults are 10 MiB per image, 16 million
decoded pixels per image, eight images and 20 MiB encoded image history per run.
`media.images.maxBytes`, `maxPixels`, `maxImages` and `media.maxTotalBytes` accept
positive safe integers. Pixel checks occur after decoding and do not bound a
decoder's transient allocations. There is no automatic resize or transcoding.

The application owns engine/model loading and unloading. Image opt-in asserts
that its selected model supports images; it does not discover or prove that
capability. Structural consumer checks against published WebLLM 0.2.85/0.2.86
declarations pass with upstream declaration-body checking skipped; full checks
require upstream development declarations absent from the standalone archives.
Neither those checks nor these mocked worker contracts qualify a real VLM.
Selecting/downloading and testing a real vision model is a separate decision.

### Prepared real WebLLM vision canary

`local-webllm-vision-smoke` is a separate live target, prepared for a later
explicit model/download decision. It has not been run to qualify a VLM.
It refuses CI and requires all of `LOCAL_LLM_E2E=1`,
`LOCAL_LLM_WEBLLM_VISION=1`, `LOCAL_LLM_DOWNLOAD=1`, an absolute
`WEBLLM_MODULE_PATH`, and an explicit `WEBLLM_MODEL`. There is no default vision
model and no inference HTTP fallback.

After selecting and approving a compatible application-owned model and bundle:

```sh
NX_DAEMON=false NX_NO_CLOUD=true NODE_ENV=production \
  LOCAL_LLM_E2E=1 LOCAL_LLM_WEBLLM_VISION=1 LOCAL_LLM_DOWNLOAD=1 \
  WEBLLM_MODULE_PATH="$APP_WEBLLM_BUNDLE" WEBLLM_MODEL="$APP_VISION_MODEL" \
  npx nx local-webllm-vision-smoke conformance
```

Appending `--list` discovers the tests without running their bodies, opening the
profile, importing the supplied runtime bundle, or loading/downloading a model.
The live target uses installed Chrome and its own persistent
`hashbrown-webllm-vision-profile` beneath the system temporary directory; it does
not use `LOCAL_LLM_PROFILE`, the native test profile, or a personal profile.
Its model cache persists there. Both framework projects run sequentially.

Each project loads one application-owned worker engine, then uses fresh chat
threads for a red image and a blue image without navigating or reloading the
model between them. Angular uses red then blue; React uses blue then red. Each
96×64 generated image contains two foreground squares on white. The identical
prompt asks for the latest image's lowercase square color and square count,
without naming the target color or count. A structured schema constrains
`answer` and `count`; exact parsed red/blue and count assertions, raw response
JSON, schema, finish status, reader drain, single-image history, resolver cleanup,
and forbidden fallback checks must all pass. The fixture unloads the engine and
terminates its worker at the end, after active generation has drained.

Reports contain bundle SHA-256, selected catalog artifact URLs and estimated
VRAM, browser/GPU metadata, loading/first-token/total times, generated dimensions,
image MIME/count/byte totals, schema and response evidence, memory-method caveat,
and cleanup/fallback counts. They do not serialize image data URLs or encoded
image bytes. Catalog URLs alone do not identify immutable weight revisions;
real results must retain that limitation. A successful same-device canary would
not establish broad image understanding or cross-hardware reliability.

### Selecting a local Chrome model experiment

`LOCAL_LLM_CHROME_MODEL_VERSION` accepts `default`, `v4`, or `v4_4b` for
native Chrome text/capability, media, and tool/schema/UI targets. Omission keeps
the original defaults: browser default for text/media, v4 for typed tools.
Explicit `default` omits the foundational-model override while retaining tool
interfaces when that target requests them. Unknown and empty values fail early.
This is a browser experiment, not an SDK model-selection option.

The tested v4 profile identifies `gemma4-2b-it`. The installed Chrome 155 manifest
has a separate Gemma `v4_4b` route and a default Nano v3 route. Neither the word
v4 nor an accepted flag establishes Gemini Nano 4B. Inspect the actual downloaded
manifest and `chrome://on-device-internals` before naming a model. Missing
experimental manifest keys can fall back to the browser default.

```sh
LOCAL_LLM_E2E=1 LOCAL_LLM_CHROME_MODEL_VERSION=v4_4b \
  LOCAL_LLM_PROFILE=/absolute/path/separate-4b-test-profile \
  npx nx local-native-tool-capability-smoke conformance
```

That command checks interfaces/availability only and does not download or infer.
Normal download gates still apply; live workflow suites refuse downloads.
Playwright metadata records the requested configuration and whether it applies
to native execution; deterministic contracts and WebLLM do not qualify it.
See the [current qualification report](../../docs/superpowers/research/2026-10-25-local-model-qualification.md)
for model availability, release status, and current Ollama/WebLLM limitations.

### Chrome media input

```sh
LOCAL_LLM_E2E=1 npx nx local-media-contract-e2e conformance
LOCAL_LLM_E2E=1 LOCAL_LLM_PROFILE=/absolute/path/dedicated-test-profile \
  npx nx local-media-smoke conformance
LOCAL_LLM_E2E=1 LOCAL_LLM_PROFILE=/absolute/path/dedicated-test-profile \
  npx nx local-native-audio-smoke conformance
```

`local-media-contract-e2e` runs generated image and retained speech inputs through
both framework hooks/resources and the real Chrome transport, with a deterministic
native API shim. It checks decoded ImageBitmap/encoded Blob input, exact modality
options, rendered answers and resolution/session cleanup. It is not model
inference. `local-media-smoke` uses real Chrome inference for the same four
framework/modality cases. The installed Chrome 155 run passed all four, with
one resolution/disposal and one session creation/destruction per run. `local-native-audio-smoke`
is a separate raw browser transcription canary, not a Hashbrown adapter test.
The retained raw audio target passed both project cases with “The secret code
is 7429.” and confirmed session destruction (Angular 22.823 seconds, React
24.270 seconds). Availability alone is not an audio inference pass.

All three targets reject CI and require `LOCAL_LLM_E2E=1`. Media targets enable
audio with `LOCAL_LLM_AUDIO=1`; the real media target also sets
`LOCAL_LLM_MEDIA_NATIVE=1`. Native audio sets `LOCAL_LLM_NATIVE=1` and selects
`native runtime transcribes generated speech`. They require already available
models and never initiate model downloads, even with `LOCAL_LLM_DOWNLOAD=1`.
Run GPU suites sequentially. Native targets share the dedicated
`hashbrown-local-chrome-profile` under the temporary directory by default;
`LOCAL_LLM_PROFILE` explicitly selects a dedicated profile for any native target.

Host fixtures select `localModel=chrome&localMedia=image|audio`. The image is a
generated red canvas. Speech comes from `local-models/fixtures/speech.wav` and
its adjacent provenance/hash metadata; no microphone, camera, personal files
or personal browser content are read. The application resolver accepts inline
base64 only and records acquired/released resources and created/destroyed
sessions. Reports attach scope, availability, rendered answers, timing and
lifecycle evidence under `test-results/conformance/local-models`.

Public media support is off by default. Use
`experimental_chrome({ media: { images: {}, audio: {}, resolve } })`; `resolve`
receives an AG-UI image/audio part and `{ signal }`, and returns `{ blob, dispose? }`.
Inline `{ type: 'data', value, mimeType }` sources use canonical base64 bytes; URL/file sources need application
policy and are never fetched implicitly. Images accept PNG/JPEG/WebP, defaulting
to 10 MiB and 16 million pixels each. Audio accepts encoded PCM16 RIFF WAV only,
with one/two channels at 8–48 kHz, defaulting to 10 MiB and 30 seconds each.
`maxTotalBytes` defaults to 20 MiB per run. `inputLanguages` defaults to `['en']`
independently of output language. Media rejects unknown availability and requires
an explicit `events.downloadRequired` callback before any needed download;
it does not support `transformRequest`. Each media run has an isolated native
session and releases owned decoded bitmaps and explicit resolver disposers. Canonical
AG-UI multipart content survives lowering and immutable history snapshots;
ordinary JSON arrays retain their legacy representation.

## Ports and reports

| Suite          | Angular | React | Override                                                     |
| -------------- | ------- | ----- | ------------------------------------------------------------ |
| Conformance    | 4411    | 4412  | `RUNTIME_SMOKE_ANGULAR_PORT`, `RUNTIME_SMOKE_REACT_PORT`     |
| Provider       | 4421    | 4422  | `NATIVE_PROVIDER_ANGULAR_PORT`, `NATIVE_PROVIDER_REACT_PORT` |
| `serve-static` | 4311    | 4312  | `--port`                                                     |

Reports go to `test-results/conformance/{conformance,provider,all}` and
`playwright-report/conformance/{conformance,provider}`.

Standalone conformance uses a 15 second whole-test timeout. The provider and
combined runs use 30 seconds. Individual assertion deadlines are the same in
every run.

## Provider and capability follow-ups

Local server evaluations use the existing public Ollama and OpenAI Responses
adapters against loopback only. They do not install or download models. Start
Ollama and select an already installed model with `LOCAL_LLM_MODEL` (default
`qwen2.5:14b`); `LOCAL_LLM_HOST` defaults to `http://127.0.0.1:11434`.

```sh
LOCAL_LLM_E2E=1 npx nx local-provider-smoke conformance
```

This checks constrained output, two independent tool calls and result replay,
truncated tool safety, cancellation and recovery, and a semantic schema-plus-tools
golden. Ollama 0.35.0 with the tested Qwen model guesses the final JSON token
without calling the lookup when schema and tools are combined. To record this
known limitation as two **expected failures**, opt in explicitly:

```sh
LOCAL_LLM_E2E=1 LOCAL_LLM_SCHEMA_TOOLS_UNSUPPORTED=1 \
  npx nx local-provider-smoke conformance
```

Only a successfully completed, schema-valid answer that skips the lookup is
classified as this expected failure. Connection, timeout, protocol and malformed
JSON failures remain ordinary failures. The assertion still runs and fails; it
is not a capability pass. If the model
begins satisfying the golden, the unexpected pass fails the run so the flag can
be removed. This setting applies only to that combined semantic case, not the
protocol/cancellation regressions. The installed-provider suite recorded 10 expected outcomes and zero unexpected
outcomes, including the two explicitly expected schema-plus-tools semantic
failures. The server's malformed completed Responses payload (`output: null`
after truncation) now produces `RUN_ERROR` with
`OpenAI Responses protocol error: response.completed response.output must be an array`; no partial tool call
may become executable. Injected shared Ollama clients cannot expose a pending
HTTP request through the SDK before headers: consumer cancellation settles
promptly, and any late stream is aborted individually. Owned clients additionally
abort fetch before headers.

Local provider workflows also have separate deterministic and live targets:

```sh
LOCAL_LLM_E2E=1 npx nx local-provider-workflow-contract-e2e conformance
LOCAL_LLM_E2E=1 npx nx local-provider-workflow-smoke conformance
```

Both reject CI. The contract target uses an aimock upstream; the live target
sets `LOCAL_LLM_WORKFLOWS_LIVE=1` and uses the installed `LOCAL_LLM_MODEL` at
`LOCAL_LLM_HOST`. They drive real framework tool handlers, dependent lookup,
application-owned approval/denial before protected operations, automatic result
replay, follow-up history and rendered final answers through loopback AG-UI
routes. The permission gate belongs to the fixture application. No model,
browser or dependency is installed by these targets. The installed-model
20-case workflow run recorded 12 passes, four expected schema-only answers that
skipped required tools, and four unexpected final receipt mismatches in the
dependent-tool golden. Independent review confirmed correct handler arguments and canonical result
replay: the provider changed `HB_RECEIPT_<uuid>` to `HB_RECEPT_<same uuid>` in
its final answer, and the UI rendered that text faithfully. No protocol or
framework error was found and no blanket expected-failure rule was added; the
live suite remains not green because of this model copy defect. A live model's failure to
select the required tools remains a semantic failure rather than a transport
capability pass.

Native runtime capabilities and a synthetic-image canary have a separate local
target. Use the same dedicated profile as native smoke to reuse its weights:

```sh
LOCAL_LLM_E2E=1 LOCAL_LLM_PROFILE=/absolute/path/dedicated-test-profile \
  npx nx local-native-capability-smoke conformance
```

It records exact modality/tool option checks and then describes a generated red
canvas after an explicit browser click. Unavailable image inference fails rather
than being counted as a pass. Audio availability is recorded without microphone
access or audio inference. Accepted tool content types alone do not establish
functional tool calling; the test also records whether declarations are read and
native tool result constructors exist. This is a browser-runtime probe, not a
Hashbrown media adapter. Downloads still require `LOCAL_LLM_DOWNLOAD=1`.

### Experimental native tool interfaces only

```sh
LOCAL_LLM_E2E=1 LOCAL_LLM_PROFILE=/absolute/path/dedicated-test-profile \
  npx nx local-native-tool-capability-smoke conformance
```

This non-cacheable local target rejects CI, enables `LOCAL_LLM_NATIVE_TOOLS=1`
and runs interface/availability checks in both framework projects. It never
calls `LanguageModel.create()`, performs inference or starts a model download.
Reports use the separate `native-tools` output directory and
`native-tools-report.json`. Keep its results distinct from model capability.

The [official Chrome tool-use demo](https://chrome.dev/web-ai-demos/prompt-api-tool-use/)
names `chrome://flags/#prompt-api-tool-use`. The installed Chrome 155 source
maps it to `AIPromptAPIToolUse,OnDeviceModelConversationBackend,AIApiFoundationalModel:model_version/v4`.
The target appends those explicit experimental features only to its test
browser launch; other native targets keep normal feature defaults. It uses the
shared native test-profile default and supports `LOCAL_LLM_PROFILE`.

Normal defaults left typed constructors absent and ignored declarations.
With the official flag, fresh and preserved-profile probes exposed all three
constructors and read the `tools` member. Chrome 155 uses `callID`, while the
newer draft uses `callId`; the probe records the returned spelling. Exact
text/tool-call/tool-response input and text/tool-call output availability was
`downloadable`, including in the preserved dedicated profile. The retained
target passed both interface checks with this status and no model creation. The v4 model
required a separate explicit download opt-in before a real typed tool
round trip could run; the October 24 follow-up below performed that download. No newer browser or origin-trial token was used for these
interface checks. Constructor or option recognition alone is not inference
evidence; see the separate real round-trip results below.

### Real native tool round trips (experimental v4)

```sh
LOCAL_LLM_E2E=1 LOCAL_LLM_PROFILE=/absolute/path/separate-v4-test-profile \
  npx nx local-native-tool-roundtrip-smoke conformance
```

This separate non-cacheable target refuses CI and checks exact hidden-token
success, error and fresh-session typed history. It enables the same official v4
feature bundle as the interface probe. Its default profile is
`hashbrown-native-tools-model-profile` inside the system temporary directory; keep v4 separate from an existing
image/audio profile. Downloading requires `LOCAL_LLM_DOWNLOAD=1` and a trusted
button click; without that opt-in only an already available model is used.
Reports are written under `native-tools-roundtrip`, independently of interface
results. Preserve each JSON report before rerunning.

The October 24 Chrome 155/v4 run downloaded `gemma4-2b-it` and emitted real typed
calls, but all six initial strict cases failed because native `callID` was empty.
The target deliberately keeps rejecting empty IDs by default. A separately
labeled compatibility probe uses:

```sh
LOCAL_LLM_E2E=1 LOCAL_LLM_TOOL_ID_NORMALIZATION=1 \
  LOCAL_LLM_PROFILE=/absolute/path/separate-v4-test-profile \
  npx nx local-native-tool-roundtrip-smoke conformance
```

This assigns a UUID only to a sole empty-ID call and consistently uses it in
responses and reconstructed history. The original native ID is retained in
evidence. The complete eight-case compatibility run passed exact success/error and
fresh success/error history assertions in both browser projects. This establishes a single-call workaround,
not native multi-call identity correlation. See the
[dated research](../../docs/superpowers/research/2026-10-24-chrome-native-tools.md)
for component versions and measurements. These raw probes do not run framework
handlers or establish generative-UI/schema-plus-tools support.

### Native tools with schema finalization

`experimental_chrome_tools({ schemaFinalization: 'after-tool-planning' })`
composes the existing structured chat schema with framework-owned native tools.
Planning is unconstrained and its prose is private to the native session. Valid
calls return to normal Hashbrown handlers; dependent calls can request more
rounds. A call-free planning turn triggers one same-session constrained final
prompt. Only final text reaches Skillet. Media composition remains unsupported,
and the default native-tools factory still rejects schemas. The same opt-in also
supports the component UI workflow below.

```sh
NODE_ENV=production LOCAL_LLM_E2E=1 npx nx local-native-schema-contract-e2e conformance
NODE_ENV=production LOCAL_LLM_E2E=1 LOCAL_LLM_PROFILE=/tmp/hashbrown-native-tools-model-profile \
  npx nx local-native-schema-workflow-smoke conformance
```

These cache-free targets inherit the native tools CI refusal and run one browser
at a time. The live target uses the already downloaded v4 profile and refuses
downloads. The actual React/Angular fixtures use `useStructuredChat` and
`structuredChatResource`, real lookup/dependent handlers and hidden random
tokens. Contracts cover phase constraints, exact schema consumption, rejected
final tools/malformed output and Stop/recovery. The shim retains within-session
history and forwards the constraint for inspection without enforcing or repairing
model output. The native observer records actual prompt options and chunks.
Reports are separate under `test-results/conformance/native-schema`.

Capability reporting distinguishes the opt-in adapter policy from unverified
inference. A passing exact-token sample does not prove arbitrary schema grammar
support or model reliability. Never remove fences or weaken exact assertions to
make a live result pass. Keep quality failures separate from lifecycle defects.

### Native tools followed by component UI

Use the same finalization policy with `useUiChat` or `uiChatResource` and your
existing exposed components. Tools gather data first; the terminal response uses
the exact generated component schema and streams through the existing parser and
renderer. Components are not executable tools. UI requires an object response
schema; default transport rejection and media restrictions remain.

```sh
NODE_ENV=production LOCAL_LLM_E2E=1 npx nx local-native-ui-contract-e2e conformance
NODE_ENV=production LOCAL_LLM_E2E=1 LOCAL_LLM_PROFILE=/tmp/hashbrown-native-tools-model-profile \
  npx nx local-native-ui-workflow-smoke conformance
```

These uncached targets inherit CI refusal and single-worker execution. The
fixtures use real framework UI APIs and application-owned lookup/dependent
tools. Contracts inspect phase constraints, exact tool data in actual DOM,
canonical replay, malformed UI and cancellation/recovery. The shim can hold a
terminal response mid-prop to verify fallback rendering before completion; it
does not enforce or repair the model's schema. Evidence and reports are retained
under `test-results/conformance/native-ui`.

Each scenario offers a bounded catalog: lookup + status, dependent lookup/follow

- status, lookup + status/panel for nesting, or status alone without tools. Tests
  assert the actual native tool declarations and exact terminal component schema,
  as well as exact handler operations and output. The fixture query
  `uiWorkflow=broad` retains the original broader catalog for research; qualification
  uses the scenario-specific `uiWorkflow` values.
  Two fixed production samples with these bounded declarations passed 2/8 then
  4/8; only the no-tools cases passed in both. Passing deterministic contracts
  does not establish native tool-driven UI reliability. Retain all model failures
  and keep the native quality gate separate from CI.

Adapter capability `ui` follows the opt-in policy; inference remains unknown.
Measure the exact component kit separately from a simple structured response.
Bounded child composition does not establish unrestricted recursive-schema
support. See the [dated research](../../docs/superpowers/research/2026-10-25-local-component-ui-tools.md)
for current measurements and limitations.

### Application-controlled native UI phases

Use `toolPhase(context)` with the existing schema-finalization opt-in to select
exactly one tool or direct finalization from immutable current-turn results. Tool
phases reject missing, repeated and out-of-phase calls before execution. The
final phase permits zero executable calls. Chrome requires historical native
declarations for typed replay, so finalization retains only names referenced by
validated history, including previous turns; unused declarations are omitted.
The final stream rejects every non-text chunk regardless of retained names.

```sh
NODE_ENV=production LOCAL_LLM_E2E=1 npx nx local-native-ui-phase-contract-e2e conformance
NODE_ENV=production LOCAL_LLM_E2E=1 LOCAL_LLM_PROFILE=/tmp/hashbrown-native-tools-model-profile \
  npx nx local-native-ui-phase-workflow-smoke conformance
```

These targets opt into `LOCAL_LLM_APPLICATION_TOOL_PHASES=1`, are uncached, inherit
the CI refusal and run one browser at a time. They retain separate reports under
`test-results/conformance/native-ui-phases`. The model-led targets above remain
separate. Contracts cover real React/Angular rendering, exact active/retained
declarations, direct terminal schemas, raw output, replay, Stop/recovery and
adversarial zero/repeated/out-of-phase calls. Private phase instructions append
to the same native prompt after unchanged history and never enter canonical
history. Native qualification includes both framework workflows and a subsequent
user turn reusing typed history.

The [phase research](../../docs/superpowers/research/2026-10-25-chrome-tool-phases.md)
records the rejected zero-declaration replay and the separate exact-value failure
in the compatibility alternative. A passing capability/replay probe is not proof
of correct component output. Keep exact assertions and all native failures.
Two predetermined phase samples each passed 8/10, with the same single-component
cases passing in both (16/16). The full native command includes the still-failing
nested canaries; they remain strict failures with raw evidence. One sample failed
inside Chrome before tool execution; another rendered the wrong panel heading.
Nested UI is not qualified by the passing deterministic contracts.
The approved scope is the measured single-component lookup/dependent/no-tools/
replay workflows. To run those cases explicitly, use:

```sh
NODE_ENV=production LOCAL_LLM_E2E=1 LOCAL_LLM_PROFILE=/tmp/hashbrown-native-tools-model-profile \
  npx nx local-native-ui-phase-workflow-smoke conformance -- --grep-invert='native UI nested'
```

The unfiltered command above retains both nested research cases and currently
returns failures for them. No assertion is weakened and no test is marked skipped
or expected-to-fail. Qualification does not imply arbitrary prompt reliability.

### Native tools through actual framework handlers

```sh
LOCAL_LLM_E2E=1 npx nx local-native-tool-contract-e2e conformance
LOCAL_LLM_E2E=1 LOCAL_LLM_PROFILE=/absolute/path/separate-v4-test-profile \
  npx nx local-native-tool-workflow-smoke conformance
```

These targets use `experimental_chrome_tools()` through real React/Angular
providers and tools. The deterministic target has 18 aimock-backed contracts:
canonical replay, dependent results, application-owned Allow/Deny before side
effects, ambiguous/malformed/unknown calls, valid-ID batches and Stop. The live
target uses Chrome's experimental v4 bundle and refuses model downloads; prepare
the explicitly selected profile with the raw canary first. Both targets require
local opt-in, reject CI and are excluded from standard discovery. Reports live
under `test-results/conformance/native-tool-workflows`.

The initial correct-profile live run passed 6/8 cases. Both dependent handlers
ran with exact correlated values, but the model returned the exact receipt
inside fenced JSON instead of the requested plain string, identically in both
frameworks. Raw chunks and rendered text agreed; no page errors, fallback
requests or unbalanced sessions were observed. This formatting failure remains
recorded in the dated research. Native-specific application instructions now
make property extraction explicit; the transport never rewrites that prompt or
normalizes model text. The clarified ten-case live run passed 5/10 strict
semantic goldens: dependent receipt formatting, one Allow reply and both
Stop/fresh-lookup cases failed. A final Stop-only run verified the source
cancellation boundary in both frameworks before both semantic goldens failed:
old sessions were destroyed before fresh creation, no old chunks arrived
thereafter, readers returned to zero, and sessions balanced. The fresh model
sessions continued the cancelled counting instruction. The dated research
preserves reports and distinguishes this model/history quality failure from
transport cancellation. A separate raw schema-plus-tools probe returned JSON
without calling the tool; joint schema/tools support remains unverified and
explicitly unsupported by the factory.

Final local verification also passed the standard 72-case browser suite,
10 deterministic workflow cases, 24 existing aimock transport contracts and
45 conformance unit tests; conformance build/lint passed. Local-only cases remain
outside standard discovery. Initial concurrent-start/nested-Nx batching failures
occurred before tests; these results come from completed sequential or standalone
runs. Existing warnings remain visible in logs. The installed-model workflow
receipt-copy failures described above remain visible and keep that live quality
suite from being green.

### Explicit cancellation history follow-up

Shared core now preserves a stopped or superseded user request with a factual
runtime cancellation record before later model input. It keeps committed tool
results and existing rollback behavior; the record is hidden from ordinary,
structured, UI and streaming assistant projections. Exact metadata-free agent
snapshot echoes preserve locally owned marker identity.

The updated standard browser cancellation assertions passed in both frameworks
(full suite 72/72), as did all 18 native aimock workflows and the final focused
Stop contracts. Real v4 Stop/fresh-lookup cases now passed 2/2 with the exact
original request, marker, new lookup and hidden token: both history and source
boundary evidence flags were true, sessions balanced 3/3 and active readers
returned to zero. This focused result does not regrade the historical ten-case
quality suite above or imply constrained final text. Evidence and the approved
policy are recorded in `docs/superpowers/research/2026-10-24-cancelled-turn-markers.md`.
Local installed-model and native aimock targets remain outside CI.

## Model and schema measurements

`WEBLLM_SCHEMA_DEPTHS` (default `1,4,8`) and `WEBLLM_SCHEMA_WIDTHS` (default
`4,16,32`) select bounded probes, each size limited to 1–64. `WEBLLM_MAX_TOKENS`
(default 256, maximum 2048) controls the application's normal generation cap;
the recovery test separately forces a one-token truncation and restores 256.
Width probes use UI-shaped JSON with distinct component alternatives and assert
the requested selection. They are engine grammar/quality probes; the separate
nested-UI case verifies actual trusted component rendering.

```sh
LOCAL_LLM_E2E=1 WEBLLM_MODULE_PATH=/absolute/path/package/lib/index.js \
  WEBLLM_MODEL=Qwen2.5-1.5B-Instruct-q4f16_1-MLC \
  WEBLLM_SCHEMA_DEPTHS=1,4,8,16,32 WEBLLM_SCHEMA_WIDTHS=4,16,32 \
  WEBLLM_MAX_TOKENS=1024 \
  npx nx local-webllm-smoke conformance \
  --grep='streams structured|bounded schema-depth|larger UI'
```

Repeat with different supported model IDs, copying `webllm-report.json` after
each run because the next run overwrites it. Reports include CPU/architecture,
RAM, browser user agent and WebGPU adapter metadata alongside each model's load,
request and schema measurements. Run suites sequentially to avoid host/profile
collisions and GPU contention. A successful schema probe is a tested bound, not
a maximum schema size or model quality guarantee.

The depth report retains raw output, finish reasons and parse errors even when
a probe fails. Token exhaustion fails the probe even if its text parses: valid
JSON alone does not establish normal completion. More output tokens may only
extend whitespace generation; preserve the original failure when retrying a
different budget.

The measured hardware so far is an M1 Max Mac with 32 GB unified memory.
Windows/Linux and NVIDIA/AMD results remain unmeasured. Use these same commands
on those machines and preserve hardware metadata; do not extrapolate their
eligibility, latency or memory from the Mac measurements. No local model target
is included in CI, and all local configs refuse CI execution.

The targets set their mode variables through Nx's `env` option. In PowerShell,
set caller variables separately instead of using the shell prefixes above:

```powershell
$env:LOCAL_LLM_E2E = '1'
$env:WEBLLM_MODULE_PATH = 'C:/path/to/package/lib/index.js'
$env:WEBLLM_MODEL = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC'
npx nx local-webllm-smoke conformance
```

This provides a collection entry point; Windows execution remains unverified.

## .NET cold recovery and maintenance

The .NET provider matrix uses genuine OpenAI and Azure clients with aimock at
only the model boundary. `npx nx provider-e2e dotnet-conformance` builds the two
browser hosts, compiles the exact eight recipe combinations and tests both
frameworks/providers. Cold structured/UI cases exercise the source SDK's
explicit historical-diagnostics restore policy. This opt-in is unreleased;
0.8.1 consumers retain strict restoration. Tests preserve exact native history
and require a new explicit approval after reload. Diagnostics are escaped text,
not proof of cancellation ownership or permission to execute work.

`npx nx test dotnet-conformance` includes real PostgreSQL retention tests. Set
`DOTNET_TEST_POSTGRES` to an isolated test database or allow the fixtures to own
a disposable PostgreSQL 18 container. The tests create unique schemas and
remove only their own resources. Maintenance commits independently of admission,
uses bounded row-locked batches and preserves unresolved post-effect metadata.

To collect timing evidence for the original worker-restart case, set
`DOTNET_RECOVERY_TIMINGS=1` and run:

```sh
npx nx provider-e2e dotnet-conformance \
  --grep='reload after worker death' --repeat-each=5
```

Failed cases attach a `recovery-timeline` automatically. It contains one Node
monotonic clock domain, opaque fixture span IDs, fixed phase/component fields
and numeric HTTP statuses. Each case caps collection at 256 events and 32 spans
and reports dropped counts. It adds no transcript, URL, exception text or
credential capture. Compare route upstream headers, first bytes and browser
response boundaries; `/health` proves process liveness, not provider readiness.
Keep the original five-second assertion and zero retries when investigating.
A repeat pass alone does not establish the cause of an earlier failure.
