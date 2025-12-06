## Vox VAD worklet: getting binaries to load in dev and builds

This is the checklist I used to make the VAD assets load in the React sample. Reapply these steps if you rebuild the package from scratch.

### 1) Package metadata & exports
- `packages/vox/package.json` should:
  - Include `"sideEffects": false`.
  - Point to built entrypoints: `"main": "./index.cjs"`, `"module": "./index.mjs"`, `"types": "./index.d.ts"`.
  - `files` should include `README.md`, `LICENSE`, `package.json`, `index.*`, and `assets/**/*`.
  - Add an explicit export map:
    ```json
    "exports": {
      ".": {
        "types": "./index.d.ts",
        "import": "./index.mjs",
        "require": "./index.cjs",
        "default": "./index.cjs"
      },
      "./wasm": "./assets/vad_audio_worklet.wasm",
      "./loader": { "import": "./assets/vad_audio_worklet.js", "require": "./assets/vad_audio_worklet.js" },
      "./worker": "./assets/vad_audio_worklet.ww.js",
      "./async": "./assets/vad_audio_worklet.aw.js",
      "./package.json": "./package.json"
    }
    ```

### 2) Build config
- `packages/vox/tsconfig.json`: set `"module": "esnext"` (rollup will emit both CJS/ESM).
- `packages/vox/rollup.config.cjs` (or `project.json` options):
  - `outputFileName: "index"`, `outputFileExtensionForEsm: ".mjs"`, `outputFileExtensionForCjs: ".cjs"`.
  - Assets: copy `packages/vox/src/assets/**/*` to `dist/packages/vox/assets`.
  - Copy `*.md` to the package root in dist.

### 3) Assets
- Place the current worklet outputs in `packages/vox/src/assets/`:
  - `vad_audio_worklet.js`
  - `vad_audio_worklet.aw.js`
  - `vad_audio_worklet.ww.js`
  - `vad_audio_worklet.wasm`
- These should match the contents of `wasm/vad-audio-worklet/output/`.
- Build with `nx build vox` to emit them under `dist/packages/vox/assets/`.

### 4) Runtime asset resolution (in `packages/vox/src/lib/vad.ts`)
- Resolve assets relative to the packaged `assets/` folder:
  - Default base path: use `import.meta.url` when running from built package or node_modules; otherwise fall back to `/dist/packages/vox/assets/` for workspace dev.
  - `resolveAssetUrl(filename)` returns `new URL(filename, assetBase).href`.
  - Patch `AudioWorklet.addModule` so `.aw.js`/`.ww.js` resolve relative to that base.
- Avoid hardcoded `/@fs/.../src/assets` paths; ensure dev serves from built dist assets.

### 5) Dev server (smart-home React Vite)
- Add COOP/COEP headers so SharedArrayBuffer works:
  - Middleware already added: sets `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` for dev/preview.
  - Optionally also set Vite `server.headers` and `preview.headers` to the same values to cover all responses (HMR, HTML, static assets).
- Serve built vox assets via middleware:
  - Map `/dist/packages/vox/assets/*` to `dist/packages/vox/assets/*` on disk.
  - Ensure `nx build vox` has been run so these files exist.

### 6) Consumer usage (VADView)
- Import `VADAudioWorklet` from `@hashbrownai/vox` and call `start()`.
- No `basePath` needed when assets are in the package; dev server must serve `dist/packages/vox/assets/` with COOP/COEP headers.

### 7) Commands to run after reapplying
1. Copy fresh worklet outputs into `packages/vox/src/assets/` from `wasm/vad-audio-worklet/output/`.
2. `nx build vox`
3. Restart the smart-home React dev server (so it serves the new dist assets with headers).
4. Load the VAD view and start; check `window.crossOriginIsolated` is `true` and asset responses include COOP/COEP headers.
