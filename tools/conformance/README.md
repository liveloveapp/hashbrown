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
