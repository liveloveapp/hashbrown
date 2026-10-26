# WebLLM image structural qualification

The opt-in image API was checked against actual standalone npm source archives for WebLLM 0.2.85 and 0.2.86. No WebLLM dependency, runtime, model, GPU inference or ambient upstream replacement was used. Repository TypeScript 6.0.2 checked both direct `MLCEngine`, `WebWorkerMLCEngine`, and `MLCEngineInterface` surfaces for each version, plus actual request/chunk assignments and negative legacy-engine/role/image-URL controls. Core compile controls permanently retain default-string content and literal/variable image opt-in rejection for a legacy text engine.

Local archive SHA-256 values from the source research:

- 0.2.85: `d6073d44c3705f08ef20e1c09ecc0336e7f04e7337ea424efe8603b54a9b7b49`
- 0.2.86: `b104049691e1926c689109831887a3e7b2443df48ecb1e0f1a697e53564b5d4e`

The session consumer fixture is `/tmp/hashbrown-webllm-types/repo-consumer.ts`, importing the real archived engine declarations and the implemented transport's public types. Its strict check was:

```sh
node_modules/.bin/tsc --ignoreConfig --strict --noEmit \
  --target es2022 --module esnext --moduleResolution bundler --lib es2022,dom \
  --skipLibCheck /tmp/hashbrown-webllm-types/repo-consumer.ts
```

The strict consumer check passes with no diagnostics. Removing `--skipLibCheck` produces six TS2307 diagnostics, one per missing module per archive: `@mlc-ai/web-runtime`, `@mlc-ai/web-tokenizers`, and `@mlc-ai/web-xgrammar`. They are upstream development declarations absent from these standalone archives; they were not downloaded or mocked. This evidence establishes consumer assignability for the fields in scope while leaving upstream declaration bodies unchecked.

The deterministic browser image cases use a generated 64×64 PNG and a model-free worker shim in Angular and React. They validate application resolution, canonical data URLs, actual browser decoding, history ordering, cancellation during setup and iteration, busy rejection until draining, resource disposal, and metadata-only diagnostics. They establish transport/worker contracts; they do not establish WebLLM vision runtime correctness, a model's image understanding, inference quality, GPU memory needs, or cross-hardware behavior. Real VLM qualification remains a separate explicit model/download decision.

Availability: this new API requires main source or a subsequent release; published npm version 0.8.1 does not include it.

## Final local verification

The isolated source implementation passed core build, full test (91 suites, 1,955 tests, 14 snapshots), lint, and API report. Core lint retains three pre-existing unused-variable warnings in `models/tool-step.ts`; API Extractor retains pre-existing release-tag/link warnings, with no new WebLLM warnings. Private media helpers are absent from the public API report.

Conformance build, lint, and unit tests passed (nine suites, 57 tests), as did Angular and React fixture production builds and lint. The eight image worker cases passed, including controlled slow decoding with early setup release, cancellation, overlap and exact drain/resource ownership. Existing deterministic suites passed: 24 text/schema/UI cases, four image/audio media cases, 10 schema workflow cases and 22 UI workflow cases. Browser contracts used only isolated ports 4451/4452, with no persistent profile or inference/model loading. Existing tooling notices include Nx/Vite deprecations, a React large-chunk warning, and ts-jest's existing JavaScript/allowJs warning.

`package.json` and `package-lock.json` are unchanged. No dependency was added, no real WebLLM inference was performed, no image payload was included in metrics, and no external PR/issue was created by this implementation task.
