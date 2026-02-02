# VAD Audio Worklet Context (Hashbrown)

This document captures how the VAD audio worklet pipeline is built and wired in this repo. It is intended for fast context seeding before troubleshooting.

## Scope

Primary artifacts and their locations:

- `wasm/bin/vad-audio-worklet/vad_audio_worklet.wasm`
- `wasm/bin/vad-audio-worklet/vad_audio_worklet.js`
- `wasm/bin/vad-audio-worklet/vad_audio_worklet.aw.js`
- `wasm/bin/vad-audio-worklet/vad_audio_worklet.ww.js`
- `wasm/bin/vad-audio-worklet/vad_audio_worklet.single.js`
- `packages/vox/src/lib/vox.ts`
- `packages/vox/src/index.ts`
- `samples/react-vox-demo/src/app/app.tsx`
- `samples/react-vox-demo/src/app/VADTest.tsx`
- Build scripts in `wasm/vad-audio-worklet/`

## High-level flow

1. The React demo (`VADTest`) creates a VAD instance via `createVAD` from `@hashbrownai/vox`.
2. `VAD.initialize(createModule)` loads the Emscripten module (usually the embedded loader `@hashbrownai/vox/loader-single`).
3. `VAD.start()`:
   - Patches `AudioWorklet.addModule` to resolve `.aw.js` and `.ww.js` via a base asset URL.
   - Sets `window.logVADDecisionFromWorklet` to forward VAD decisions to the provided callback.
   - Calls the wasm `_main()` entry, which starts the audio worklet thread via Emscripten.
4. The worklet bootstrap (`vad_audio_worklet.aw.js`) registers a processor backed by wasm, then signals readiness back to wasm.
5. The wasm glue code uses JS "ASM_CONSTS" callbacks to set readiness flags on `window` and to report VAD decisions.
6. `VAD.start()` polls readiness flags, sets VAD mode, resumes the AudioContext, and connects the microphone to the worklet node.

## Key runtime hooks and globals

These are the main handshake points between wasm and JS:

- `window.logVADDecisionFromWorklet(decision)`
  - Called by wasm when it makes a decision (0 or 1).
  - `VAD` assigns this to forward to the user callback.

- `window.audioWorkletReady`
- `window._emscriptenWorkletNode`
- `window._emscriptenAudioContextHandle`
- `window.audioWorkletNativeContext`
- `Module.EmAudio`
  - Set by wasm JS glue when the worklet is initialized.
  - `VAD.start()` waits on these to find the `AudioContext` and `AudioWorkletNode` handles.

## VAD wrapper (`packages/vox/src/lib/vox.ts`)

### Initialization

- `initialize(moduleLoader)` loads the Emscripten module using:
  - `mainScriptUrlOrBlob` only when explicitly provided by the caller.
    - Otherwise the loader’s own default is preserved (embedded loader points to itself).
  - Optional `locateFile` override to resolve assets.

### Start

- `patchAudioWorkletAddModule()`:
  - Intercepts `AudioWorklet.prototype.addModule` and rewrites `.aw.js` / `.ww.js` URLs to resolve under `assetBase`.

- `setupVADCallback()`:
  - Sets `window.logVADDecisionFromWorklet` to call `onDecision`.

- Calls `module._main()`.

- Polls until `window.audioWorkletReady` and an `AudioContext` is available.

- Sets mode via `SetVADMode` and resumes the context via `ResumeAudioContext`.

- `connectMicrophone()`:
  - Calls `getUserMedia`.
  - Creates `MediaStreamAudioSourceNode`.
  - Finds the `AudioWorkletNode` from `Module.EmAudio[workletHandle]`.
  - Connects mic -> worklet -> destination.

### Stop/Dispose

- Disconnects nodes, closes context.
- Calls wasm `CleanupVAD`.
- Clears the global flags used by the worklet.

## Emscripten glue (`wasm/bin/vad-audio-worklet/vad_audio_worklet.js`)

### Exported wasm functions (via JS glue)

The wasm exports are minified but are surfaced by the glue code as:

- `_main`, `_AudioProcess`, `_OnMessageFromAudioThread`
- WebRTC VAD: `_WebRtcVad_Create`, `_WebRtcVad_Init`, `_WebRtcVad_Process`, `_WebRtcVad_set_mode`, `_WebRtcVad_ValidRateAndFrameLength`, `_WebRtcVad_Free`
- VAD wrapper: `_SetVADMode`, `_CleanupVAD`
- Audio helpers: `_ResumeAudioContext`, `_GetAudioContextHandle`, `_malloc`, `_free`

### Worklet start sequence

- `_emscripten_start_wasm_audio_worklet_thread_async`:
  - Calls `audioWorklet.addModule('vad_audio_worklet.aw.js')`.
  - Creates a bootstrap `AudioWorkletNode('message', ...)` that loads wasm in the worklet thread.
  - Calls `audioWorklet.addModule(Module['mainScriptUrlOrBlob'] || _scriptDir)`.

### ASM_CONSTS callbacks

These are the wasm->JS bridge points used to signal readiness and decision output:

- `window.logVADDecisionFromWorklet($0)`
- `window.audioWorkletReady = true`
- `window._emscriptenWorkletNode = $1`
- `window._emscriptenAudioContextHandle = $0`
- `window.audioWorkletNativeContext = EmAudio[$0]` (when available)

## Audio worklet bootstrap (`vad_audio_worklet.aw.js`)

- Defines `BootstrapMessages` processor that:
  - Installs the wasm instance inside the worklet global scope.
  - Registers the real audio processor using the callback pointer from wasm.
  - Forwards `_wsc` messages back into the wasm function table.
- Also includes a URL polyfill (added by `patch-aw.js`).

## Embedded loader (`vad_audio_worklet.single.js`)

- Inlines the wasm + aw/ww sources into a single loader.
- Produces blob URLs for `.aw.js` and `.ww.js`.
- Provides a `locateFile` that returns:
  - `data:application/wasm;base64,...` for wasm
  - Blob URLs for `.aw.js` and `.ww.js`

## Demo app usage (`samples/react-vox-demo`)

- `App` renders `VADTest` only.
- `VADTest`:
  - Creates VAD with `createVAD({ mode, onDecision })`.
  - `initialize(createModule)` on mount (using `@hashbrownai/vox/loader-single`).
  - Start/stop via buttons.
  - Mode is updated via `setMode`.

## Build pipeline (wasm/vad-audio-worklet)

### build.sh

- Docker-only build to generate artifacts into `wasm/vad-audio-worklet/output`.
- After build, runs `patch-aw.js` to modify `vad_audio_worklet.aw.js`.

### patch-aw.js

- Injects URL polyfill into `vad_audio_worklet.aw.js` if missing.
- Modifies the worklet message handler to forward `{ type: 'integer' }` messages.

### promote.sh

- Copies build artifacts from `output/` to `wasm/bin/vad-audio-worklet/`.
- Copies `.js` files into `packages/vox/src/assets/`.
- Runs `embed-singlefile.mjs` to regenerate the embedded loader.

### embed-singlefile.mjs

- Generates `vad_audio_worklet.single.js` in both:
  - `wasm/bin/vad-audio-worklet/`
  - `packages/vox/src/assets/`
- Copies `vad_audio_worklet.js` from vox assets back to the bin directory.

### CMakeLists.txt

Emscripten flags include:

- `-s AUDIO_WORKLET=1`
- `-s WASM_WORKERS=1`
- `-s MODULARIZE=1`
- `-s EXPORT_ES6=1`
- `-s USE_ES6_IMPORT_META=1`
- `-s EXPORTED_RUNTIME_METHODS=["ccall","cwrap","HEAP8","HEAP16","HEAP32","HEAPU8","HEAPU16","HEAPU32"]`
- `-s EXPORTED_FUNCTIONS=[... _main, _SetVADMode, _CleanupVAD, WebRtcVad_* ...]`

## Troubleshooting checklist

- Asset resolution:
  - `AudioWorklet.addModule('vad_audio_worklet.aw.js')` is a literal string; the VAD wrapper patch must rewrite it to the correct base.
  - Confirm `assetBase` in `VAD` (default `/dist/packages/vox/assets/`).

- Worklet readiness:
  - `window.audioWorkletReady` must become `true`.
  - `window._emscriptenWorkletNode` and `window._emscriptenAudioContextHandle` must be set.
  - `Module.EmAudio` should be populated.

- Audio context:
  - `ResumeAudioContext` is called after readiness; ensure browser permission/gesture rules allow resume.

- Decision callback:
  - `window.logVADDecisionFromWorklet` must be set before `_main()`.
  - Confirm `onDecision` is set and not replaced by a stale reference.

- Microphone wiring:
  - `navigator.mediaDevices.getUserMedia({ audio: true })` must succeed.
  - `Module.EmAudio[workletHandle]` must be an `AudioWorkletNode`.

## Dev vs preview mismatch (observed)

Symptoms in preview (`npx nx preview react-vox-demo`):

- Requests for `vad_audio_worklet.aw.js` return `text/html` (SPA fallback), so the worklet bootstrap never executes.
- `VAD.start()` times out because `window.audioWorkletReady` never flips.
- The only worklet asset seen in preview output is the hashed single-file loader in `dist/samples/react-vox-demo/assets/`.
- Console error: `VAD start failed Error: VAD initialization timeout`.

Key differences vs dev (`npx nx s react-vox-demo`):

- Dev server can access repo-root or dist paths (for example `/dist/packages/vox/assets/...`), so the rewritten `AudioWorklet.addModule` path can resolve.
- Preview only serves `dist/samples/react-vox-demo`, so `/dist/packages/vox/assets/...` is not available.

Concrete request pattern reported:

- Preview requested `GET /vad_audio_worklet.aw.js` and got `200 text/html` (fallback HTML, not JS).
- On start, preview also requested `GET /dist/packages/vox/assets/vad_audio_worklet.aw.js` and got `200 text/html`.
- Dev/start additionally loaded:
  - `/@fs/.../packages/vox/src/assets/vad_audio_worklet.single.js`
  - `/@fs/.../packages/vox/src/assets/vad_audio_worklet.js`
  - and then `vad_audio_worklet.aw.js`.

Likely root causes:

- `vad_audio_worklet.aw.js` (and `.ww.js`) are not copied into the preview build output.
- `resolveAssetBase()` defaults to `/dist/packages/vox/assets/`, which is wrong for preview.
- The wasm glue hard-codes `audioWorklet.addModule('vad_audio_worklet.aw.js')`, so the embedded loader's blob URL is not used.

## Option 1 (npm-compatible self-contained loader)

Goal:

- Make `loader-single` work without requiring consumers to host extra `aw.js`/`ww.js` files from a custom path.

Implementation approach:

- Patch generated Emscripten loader code so audio worklet bootstrap uses:
  - `audioWorklet.addModule(locateFile('vad_audio_worklet.aw.js'))`
  - instead of hard-coded `audioWorklet.addModule('vad_audio_worklet.aw.js')`
- Keep `loader-single` `locateFile` behavior that already maps:
  - `.aw.js` -> blob URL
  - `.ww.js` -> blob URL
  - `.wasm` -> data URL
- Keep the `VAD.patchAudioWorkletAddModule()` fallback in `vox.ts` for non-embedded/custom-hosting flows.

Executed changes:

- Updated `wasm/vad-audio-worklet/patch-aw.js`:
  - still patches `vad_audio_worklet.aw.js` (URL polyfill + integer message forwarding),
  - now also patches `output/vad_audio_worklet.js` to replace hard-coded AW path with `locateFile(...)`,
  - fails fast if expected generated code pattern is not found.
- Updated `wasm/vad-audio-worklet/build.sh` messaging to reflect patching both generated artifacts.
- Updated checked-in generated loaders to use `locateFile('vad_audio_worklet.aw.js')`:
  - `wasm/bin/vad-audio-worklet/vad_audio_worklet.js`
  - `packages/vox/src/assets/vad_audio_worklet.js`
- Updated `packages/vox/src/lib/vox.ts` to only override `mainScriptUrlOrBlob` when explicitly provided,
  preserving embedded loader defaults for preview/prod builds.

Validation status (latest local run):

- `npx nx build vox`: pass (with warnings about baseline-browser-mapping staleness and rollup-plugin-typescript2 deprecation).
- `npx nx test vox`: no target configured (Nx error).
- `npx nx lint vox`: no target configured (Nx error).

Production-bundle verification:

- Built preview bundle contains:
  - `addModule(pe("vad_audio_worklet.aw.js"))` where `pe` is the Emscripten `locateFile` wrapper.
  - embedded `locateFile` mapping that routes `.aw.js` to blob URL (`awUrl`) and `.ww.js` to blob URL (`wwUrl`).
- This confirms Option 1 wiring is present in production output and npm-compatible single-loader flow.

Runtime check (latest local run):

- `npx nx preview react-vox-demo` launches successfully on `http://localhost:4200`.
- Direct fetches of `/vad_audio_worklet.aw.js` (or `/dist/packages/vox/assets/vad_audio_worklet.aw.js`) still return preview SPA HTML fallback (`text/html`), which is expected if those paths are requested directly in preview.
- With Option 1 applied, the production bundle maps `.aw.js` and `.ww.js` via `locateFile` to blob URLs, so those direct HTTP paths should not be needed by the single-loader runtime path.

## Quick file reference

- VAD wrapper: `packages/vox/src/lib/vox.ts`
- Public entry: `packages/vox/src/index.ts`
- Demo: `samples/react-vox-demo/src/app/VADTest.tsx`
- Build scripts: `wasm/vad-audio-worklet/build.sh`, `wasm/vad-audio-worklet/patch-aw.js`, `wasm/vad-audio-worklet/promote.sh`, `wasm/vad-audio-worklet/embed-singlefile.mjs`
- Binaries: `wasm/bin/vad-audio-worklet/`
