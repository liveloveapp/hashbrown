# Local model release-candidate qualification — November 6, 2026

This qualification checks the next Hashbrown candidate against application-owned WebLLM 0.2.87. It keeps adapter correctness separate from model accuracy. Audio and cross-hardware testing remain deferred.

## Candidate and artifacts

The candidate starts at `b8c43894080a121bbb6c7c3dafe956b4e820964d`, after the published 0.8.3 release. No runtime implementation changed during this qualification. The React lint configuration and documentation changes are listed below. The tested public local APIs already shipped in 0.8.3; this work does not introduce a new WebLLM transport or an SDK dependency on WebLLM.

Raw logs, package tarballs, installed consumers, source hashes and live reports are retained locally under:

```text
local-model-evidence/rc-2026-11-06/
```

The absolute artifact root is `/Users/blove/.codex/visualizations/2026/10/23/01a16a6f-b1ad-73f3-bfef-ac86703fefdc`. `qualified-source-files.json` identifies the checked package and harness files; `package-sha256.json` identifies the tarballs. These are local evidence files, not public download links.

Environment: Apple M1 Max, 32 GB RAM, macOS 26.5, Chrome 157.0.8103.38. The earlier October inference samples used Chrome 155. The WebLLM profile did not exist at the start of this run, so initial preparation includes a fresh model download.

WebLLM is supplied by the test application from the exact npm archive:

- Version: `@mlc-ai/web-llm@0.2.87`.
- npm integrity: `sha512-34N19988MdaEtzh8Mq/IOrfKCk2HRDOrXgEkLT28r3aiyAU6ZJSUB+v35t7zyU+0QEaFl91Y4U5SuPN/cwoHNw==`.
- Archive SHA-256: `68b81b32f0c04f8b564820b65e00fda9191ffd5a649ac4addd47c3311f02de7f`.
- Browser bundle SHA-256: `3bff4c55cd2f0200711517341babcebe7a91a8ef85b983420439fcf26835a674`.
- Application-selected model: `Phi-3.5-vision-instruct-q4f16_1-MLC`.

The archive identity does not pin model weights. Live attachments retain catalog model and WASM URLs. Those URLs can be mutable; a model ID alone does not establish immutable weight identity.

## Deterministic checks

| Check | Result |
| --- | --- |
| Core unit tests | 2,657 tests, 109 suites, 14 snapshots passed. |
| Angular unit tests | 325 passed. |
| React unit tests | 258 passed. |
| Conformance unit tests | 160 tests, 22 suites passed after the port-override regression test. |
| Local text contracts | 24 passed. |
| Native tool contracts | 18 passed. |
| Native schema contracts | 10 passed. |
| Native UI phase contracts | 30 passed. |
| WebLLM image contracts | 12 passed. |
| WebLLM tool contracts | 36 passed. |
| Documentation site tests | 2,435 tests, 268 files passed. |

Core, Angular, React, conformance and both production smoke hosts built successfully. Their lint checks passed after the React configuration fix. The documentation site's lint check passed. Controlled-worker and aimock tests establish contract behavior, not real-model accuracy.

The installed candidate consumer resolves all three tarballs from its own `node_modules`, verifies the core transport exports at runtime, and type-checks text, image and structured-tool entry points against the real 0.2.87 direct engine, worker engine and engine interface declarations. Both framework provider options accept the packed transport. Negative checks reject image opt-in on a text-only engine and media options on structured tool phases. `strict` is enabled and `skipLibCheck` is enabled: this checks consumer assignability, not every upstream declaration body.

## WebLLM 0.2.87 images

The first attempt recorded one passing React case and one Angular preparation failure. At 55/106 parameter-cache entries (about 1,400 MB, 52%), WebLLM raised `Cache.add() encountered a network error`. Angular issued zero inference requests; its worker was terminated and its object URL revoked. The rejected engine preparation also surfaced as a cleanup error. This was not a passing cold-start qualification.

After retaining that complete report, the unchanged suite was run once more against the partial cache. Both framework cases passed: four generated 96×64 image requests returned exactly the expected red/blue color and count of two. Each request finished with `stop` and drained. Both resolvers released their two images, active requests returned to zero, engines unloaded, workers terminated and object URLs were revoked. No hosted inference fallback or page error occurred. No inference assertion was retried or repaired within either suite.

The successful sample's first-token times were 17.87–19.80 seconds. Angular's resumed preparation took 337.04 seconds; React's cached preparation took 5.68 seconds. The initial React cold preparation took 725.50 seconds. These observations include different cache states and are not a runtime-speed benchmark or an estimate for other devices or networks. The failed first report is `webllm-vision-attempt-1/report.json`; the passing report is `webllm-vision/report.json`.

## WebLLM 0.2.87 structured tools

All six fixed text-only cases passed on the first tool-suite invocation: lookup to schema, dependent lookup to schema and lookup to one trusted Status component in Angular and React. The reports retain 14 raw model requests, eight handler operations and six exact final outputs. Every request finished with `stop` and drained. Each case ended idle with no error, zero active requests, an unloaded engine, a terminated worker and a revoked worker URL. The forbidden-request, page-error and cleanup-error lists were empty.

First-token times across the 14 requests were 1.13–3.28 seconds. Temperature was zero, seed was one and `max_tokens` was 256. The suite used cached model preparation, zero retries and no answer repair. Raw schemas, requests, streamed responses, canonical replay, framework outputs and terminal metadata are in `webllm-tools-live/`.

These results qualify text-only application-selected tool phases and the measured schema/one-Status workflows. They do not qualify native WebLLM tool calling, broad catalogs, nested tool/UI composition, media-conditioned tools, audio or other hardware.

## Chrome 157 qualification status

Both framework capability probes passed interface/option inspection and reported the existing experimental v4 route as `downloadable`. They created no model session and performed no inference. Fresh-model preparation and the native round-trip canary are still in progress; the October Chrome 155 phase results remain historical evidence, not a new Chrome 157 pass.

## Findings addressed

React had no `nx lint react` target. Direct ESLint also failed because existing hook-rule comments referenced an unregistered `react-hooks` plugin. The fix adds the Nx target and registers the already installed plugin; it adds no dependency and changes no runtime behavior. Lint passes with 10 existing warnings, including hook dependencies, explicit `any` and overload redeclarations. These warnings remain visible.

The live WebLLM tool configuration used separate fixed origins and ignored the smoke-host port overrides. Browser caches are origin-scoped, so sharing a profile alone did not reuse the image suite’s cached model. A failing configuration test now verifies that both project URLs and server commands honor `RUNTIME_SMOKE_ANGULAR_PORT` and `RUNTIME_SMOKE_REACT_PORT`. Defaults remain 4451/4452. The qualification uses 4411/4412 for both live suites; model and exact-output assertions are unchanged.

The conformance README still described the image API as unreleased. It now identifies 0.8.3 as the release containing image and structured-tool opt-ins. The React and Angular recipes use the same capability boundaries and dated evidence.

The first React test invocation incorrectly inherited `NODE_ENV=production` from the qualification runner and could not use `React.act`. A corrected test-environment run passed all 258 tests; the failed runner log is retained. The first WebLLM image-contract invocation omitted its separate opt-in flag and correctly refused execution. The corrected invocation is retained separately. Neither is a model or adapter failure.

The first core test run warned about a worker being force-exited. A diagnostic run with `--detectOpenHandles --runInBand` passed all 2,657 tests with no open handle reported. The final site test run passed 2,434 tests and timed out in the search-index JSON test under local concurrent load. A complete rerun with `--maxWorkers=4` passed all 2,435 tests with the original five-second timeout. Both logs are retained; no assertion or timeout was relaxed.

Existing Nx/Vite deprecations, build chunk-size notices and API-extractor warnings are retained in logs; they are not suppressed by this change.

## Reproduction

Use `npx nx <target> <project>` from the repository. The plan at `docs/superpowers/plans/2026-11-06-local-model-rc-qualification.md` records the scope and exact live gates. Local-model suites refuse CI and use zero retries. Follow `tools/conformance/README.md` for opt-in flags and explicit download permission.

For the two WebLLM live targets, set `NX_DAEMON=false`, `NX_NO_CLOUD=true`, `NODE_ENV=production`, `LOCAL_LLM_E2E=1`, `LOCAL_LLM_DOWNLOAD=1`, `WEBLLM_MODEL=Phi-3.5-vision-instruct-q4f16_1-MLC` and `WEBLLM_MODULE_PATH` to the pinned application bundle. Run sequentially:

```sh
LOCAL_LLM_WEBLLM_VISION=1 npx nx local-webllm-vision-smoke conformance --output-style=static
LOCAL_LLM_WEBLLM_TOOLS_LIVE=1 npx nx local-webllm-tools-live conformance --output-style=static
```

Also export `RUNTIME_SMOKE_ANGULAR_PORT=4411` and `RUNTIME_SMOKE_REACT_PORT=4412` to reuse the same origin caches across these sequential suites. The shared variables must be exported in the calling shell; the two opt-ins select separate suites. The image and tool contract targets instead need `LOCAL_LLM_WEBLLM_IMAGES=1` and `LOCAL_LLM_WEBLLM_TOOLS=1`, respectively, alongside `LOCAL_LLM_E2E=1`.

No answer repair, hidden retry, hosted inference fallback, audio qualification or additional hardware claim is part of this run.
