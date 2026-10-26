# WebLLM structured tool phases qualification

## Result

On 2026-10-26, application-controlled structured tool phases passed the fixed six-case real-worker sample in Angular and React using the existing application-owned WebLLM 0.2.86 bundle and `Phi-3.5-vision-instruct-q4f16_1-MLC`. Requests were text-only. This qualifies those bounded workflows on the tested device; it does not qualify native WebLLM tool calling, broad component catalogs, nested tool-plus-UI, media-conditioned tool/UI workflows, or other hardware.

| Workflow | Angular | React |
| --- | --- | --- |
| Selected lookup → exact schema output | Passed | Passed |
| Lookup → dependent call with exact hidden token → exact receipt schema | Passed | Passed |
| Lookup → one trusted Status component with exact token title and count 7 | Passed | Passed |

All six cases passed on the first fixed sample, with retries disabled. There were 14 model requests, eight tool-handler executions, and six exact final outputs. All requests ended with `stop` and drained. Each case loaded one worker engine, then unloaded it, terminated its worker, and revoked its worker URL. Terminal state was idle with no visible error, no page errors, no cleanup errors, no active requests, and no forbidden inference HTTP fallback.

## Protocol and implementation

The additive alpha API is `experimental_webllm_tools({ engine, toolPhase })`. The application selects one declared tool or finalization from an owned, frozen view of the current user turn and completed results. The model generates only the selected tool's argument object through WebLLM JSON-schema output. Hashbrown buffers at most 1 MiB of UTF-8 arguments, requires successful completion and iterator drain, validates the object, and then emits the canonical tool call. Existing handlers execute it and retain responsibility for permission and side effects. Finalization streams the original response schema or trusted component UI.

Arguments use the supported Skillet-convertible closed-object subset. Unsupported schemas, format annotations, reserved property names, weakened enum/type intersections, invalid JSON, extra properties, truncation, and cancellation before completion fail closed. A directly reproduced shared ObjectType validator bug was also fixed: arrays are no longer accepted as objects, including nested and anyOf branches. No second recursive runtime validator was introduced.

The transport preserves canonical IDs, tool arguments, and exact success/error result text. Engine-facing call/result envelopes are explicit JSON conversation records. Native WebLLM tool mode is not invoked. Existing text/image defaults remain opt-in as before; all three transports share ownership keyed to the original engine. Hashbrown adds no WebLLM dependency or peer dependency, and does not load, download, reset, or unload the application's engine.

## Environment and identity

- Source qualified: `15a1f02701702dc3ac84f8791c338a43f4c5d220`.
- Chrome 155.0.8059.85, macOS arm64, Apple M1 Max, 10 CPU cores, 32 GiB RAM; WebGPU reports Apple / metal-3.
- Runtime: application-owned WebLLM 0.2.86 browser bundle; SHA-256 `ae2642e73a4a9896c21efb3a067c4666446f8b49cbe2012f4b576f5d83d5f206`.
- Model: `Phi-3.5-vision-instruct-q4f16_1-MLC`, reused from the approved vision cache; no other model or runtime was selected.
- Catalog model URL: `https://huggingface.co/mlc-ai/Phi-3.5-vision-instruct-q4f16_1-MLC`.
- Catalog WASM URL: `https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_86/base/Phi-3.5-vision-instruct-q4f16_1_cs4k-webgpu.wasm`.
- Catalog estimated VRAM: 4,521.54 MB. This is an estimate, not measured GPU allocation. Catalog URLs do not prove immutable cached weight/WASM revisions. Only the supplied JavaScript bundle is identified by the hash above.
- Application generation settings: `max_tokens: 256`, `temperature: 0`, `seed: 1`. No retry, repair, output rewriting, or assertion relaxation.
- Dedicated temporary `hashbrown-webllm-vision-profile`, separate from native/personal profiles; Angular origin 4451, React origin 4452.

Cached engine loading ranged from 3.10–5.68 seconds (median 3.82). Across the 14 requests, TTFT ranged from 1.23–3.03 seconds (median 1.41), and total generation ranged from 1.39–4.59 seconds (median 2.10). These measurements describe this fixed run, including schema compilation where incurred, not a hardware benchmark. Optional RSS observations are collected after cleanup and are not peak/unique GPU memory measurements.

## Evidence and checks

The live suite uses hidden random tokens and receipts generated inside application handlers. Initial prompts/requests do not contain them. It independently checks exact handler arguments, canonical call IDs and arguments, projected result text, final JSON, and exact component props/count. It also asserts no native `tools` request field and no inference HTTP fallback. Terminal and cleanup evidence are captured independently even if a primary assertion fails.

- Core: 2,175 tests / 95 suites / 14 snapshots passed; build, lint, API report and structural direct/worker/interface consumers for WebLLM 0.2.85 and 0.2.86 passed. Upstream declaration bodies were skipped for structural consumers; full checking reports six missing upstream development declarations across the isolated archives. Three existing core lint warnings and 44 existing API diagnostic identities remain.
- Conformance: 101 unit tests / 16 suites, build and lint passed; both production hosts built and linted successfully.
- Deterministic browser contracts: 36 new tool cases plus 102 existing text, media, native schema/UI/application-phase, and WebLLM image cases passed. Functional cases use existing aimock LLMock; controlled workers separately verify clone boundaries, cancellation, shared ownership, and delayed iterator completion.
- Review probes proved the suite rejects cleared/replaced terminal errors, corrupted projection/context arguments, and independently corrupted canonical arguments. Observation is installed atomically with the mock engine, without init-script ordering assumptions.
- Documentation: both framework recipes reviewed; docs-site build, lint, and 1,005 tests passed. One initial concurrent docs test stopped at shared documentation generation; its sequential rerun and final build/lint passed.
- Live: six cases / 14 requests passed. Independent archive verification confirms all exact outputs and terminal cleanup.

Raw live requests, schemas, responses/chunks, canonical replay, handler operations, framework output, metadata, and the JSON report are retained separately. The first-run archive is under this chat's `local-model-evidence/webllm-structured-tools-2026-10-26/live-first`; its rebased report resolves attachment files within that archive. Verification logs and deterministic mutation reports are retained alongside it. Discovery with a nonexistent bundle found all six tests without reading/importing a runtime, opening a profile, or loading a model. Missing flags and CI both refuse discovery/execution.

Run locally with explicit application selections:

```sh
NX_DAEMON=false NX_NO_CLOUD=true NODE_ENV=production \
  LOCAL_LLM_E2E=1 LOCAL_LLM_WEBLLM_TOOLS_LIVE=1 LOCAL_LLM_DOWNLOAD=1 \
  WEBLLM_MODULE_PATH="$APP_WEBLLM_BUNDLE" WEBLLM_MODEL="$APP_MODEL" \
  WEBLLM_MAX_TOKENS=256 npx nx local-webllm-tools-live conformance
```

Appending `--list` performs discovery only. The target is uncached and refuses CI; it is not added to CI workflows. The durable live report is `test-results/conformance/webllm-tools-live/report.json` with file attachments beneath the same directory.

## Publication and remaining boundaries

A fresh npm lookup still reports `@hashbrownai/core` latest 0.8.2. That version predates the image opt-in and this structured-tool API. No npm release is performed here.

Cross-hardware qualification remains deferred at the user's request. WebLLM audio remains deferred until a suitable upstream prebuilt model is available; no custom MLC build or additional model/runtime download is authorized. Broad/nested native UI research canaries remain outside the verified single-component boundary. The separate E4B upstream report remains unposted at the user's request.

The tracked Ollama fixes [#17239](https://github.com/ollama/ollama/pull/17239) and [#18975](https://github.com/ollama/ollama/pull/18975) were still open on the 2026-10-26 GitHub API check. Their existing qualification limits remain; this WebLLM result does not change Ollama or Chrome native-model support.

PR/CI merge identity and the post-merge fixed-sample verification will be recorded after delivery.
