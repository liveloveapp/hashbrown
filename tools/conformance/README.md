# Conformance suites

These suites protect the published Hashbrown packages. They run the same
scenarios against an Angular host and a React host, so both frameworks keep
the same streaming, tool calling, structured output and generative UI
behaviour. They are internal test infrastructure, not an example to copy.

No model credentials are needed. Every model response comes from aimock or an
independent AG-UI endpoint started by the test.

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
set. Their files live outside the CI Playwright and Jest test globs. No local model
target is named `e2e` or included by `example-e2e`.

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
application-owned generation settings. Native browser tools and multimodal
generation remain outside these transports' supported scope.

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
protocol/cancellation regressions. The server's malformed completed Responses
payload (`output: null` after truncation) remains an error; no partial tool call
may become executable. Injected shared Ollama clients cannot expose a pending
HTTP request through the SDK before headers: consumer cancellation settles
promptly, and any late stream is aborted individually. Owned clients additionally
abort fetch before headers.

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
is included in CI, and both local configs refuse CI execution.

The targets set their mode variables through Nx's `env` option. In PowerShell,
set caller variables separately instead of using the shell prefixes above:

```powershell
$env:LOCAL_LLM_E2E = '1'
$env:WEBLLM_MODULE_PATH = 'C:/path/to/package/lib/index.js'
$env:WEBLLM_MODEL = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC'
npx nx local-webllm-smoke conformance
```

This provides a collection entry point; Windows execution remains unverified.
