# WebLLM vision qualification — October 25, 2026

PR #764 qualifies explicitly enabled image input through the application-owned WebLLM transport on the tested M1 Max (32 GB), macOS 26.5 and Chrome Stable 155.0.8059.85. Hashbrown adds no WebLLM dependency. The application provides the runtime, loads the model, resolves image sources and unloads its engine.

## Fixed scope and identity

- Runtime: standalone npm WebLLM 0.2.86 bundle, SHA-256 `ae2642e73a4a9896c21efb3a067c4666446f8b49cbe2012f4b576f5d83d5f206`.
- Model: `Phi-3.5-vision-instruct-q4f16_1-MLC`, selected explicitly from the runtime catalog. The observed Hugging Face metadata revision was `b40f2bfae88f59715ae109cc9d82d13ae8b2ea52`, with 2,771,562,600 known repository bytes. This metadata observation does not pin the actual downloads: the catalog uses mutable model/WASM URLs.
- Catalog VRAM estimate: 4,521.54 MB; this is not measured GPU memory.
- Dedicated persistent test profile, separate from native Chrome and personal profiles. Each framework origin populated its own model cache.
- Generated 96×64 PNGs contain two red or blue foreground squares on white. No personal image, camera or microphone was used. Angular runs red then blue; React runs blue then red.
- One application-owned worker engine per framework; fresh cleared chat history per image, neutral identical prompts, structured schema, temperature 0, seed 1 and 256-token application limit. No model-answer repair, retry or assertion weakening.

## Results

The final run at source commit `95c0c4dc22619e4a4525949b0bea3c5cfb407da8` passed both framework cases, covering four separate image requests. Raw response JSON exactly matched the expected lowercase color and count 2, and rendered values agreed. Each request carried one 423-byte PNG and the 323-byte schema, finished with `stop` and drained. Each framework loaded one engine, resolved/released two images, ended with zero active requests, unloaded the engine and terminated its worker. No configured inference fallback or terminal page error occurred.

| Framework | Cached load | Image response total times | First token times |
| --------- | ----------: | -------------------------- | ----------------- |
| Angular   |      4.31 s | 15.24 s, 17.01 s           | 14.84 s, 16.52 s  |
| React     |      4.03 s | 14.94 s, 15.73 s           | 14.57 s, 15.33 s  |

Timing is measured by the fixture around the engine operation, not a controlled performance benchmark. Aggregate browser RSS was 978,192 KiB and 1,258,000 KiB at the respective snapshots; shared pages may be counted more than once, and RSS does not measure unique GPU allocations.

The initial download run also passed both recognition cases in 8.7 minutes, but list-only reporting did not persist body attachments. A model-free success/failure reproduction established that limitation; the live config now retains a durable JSON report. The first cached run retained correct responses but exposed an invalid idle Stop action during React cleanup. The fixture now guards idle Stop in both frameworks, a model-free regression reproduces and fixes both framework errors, and the final live gate asserts page errors after cleanup. Earlier evidence remains retained; those runs are not substituted for the clean final qualification.

## Verification and evidence

Core build/API report, 91 suites / 1,955 tests / 14 snapshots and lint pass on the synchronized 0.8.2 base. Conformance build, 12 suites / 72 tests and lint pass, as do both fixture production builds/lint and all 12 model-free image contracts. Existing core lint warnings and API/build-tool notices remain. Actual 0.2.85/0.2.86 declaration consumers also pass with the previously documented upstream `skipLibCheck` caveat.

`local-webllm-vision-smoke` refuses CI and requires explicit local, vision and download flags plus an application-provided bundle and model. Its durable report is `test-results/conformance/webllm-vision/report.json`. Raw schema/response attachments remain separate from image-free measurements; no encoded image or data URL is serialized into evidence. The task retains original logs, JSON reports, decoded attachments, the independent report checker, the reporting reproduction and registry checks under `local-model-evidence/webllm-vision-2026-10-25/`, including `first-run-list-only`, `warm-run` and `final-qualification`.

## Boundaries and follow-ups

This establishes the tested generated-image recognition plus structured-output path on one device. It does not qualify arbitrary images, vision-conditioned component UI, other VLMs, audio, tools, broad reliability or cross-hardware behavior. Existing cancellation and overlap claims are protected by deterministic worker contracts rather than asserted as real-VLM inference tests. Cross-hardware testing remains deferred.

Published npm 0.8.2 includes native Chrome `toolPhase` and `schemaFinalization`, verified from the registry tarball. It does not contain this new WebLLM image API; consumers need these source changes or a later release. WebLLM native tool restrictions still conflict with Hashbrown's system/schema/history contract and require separate design or upstream changes.
