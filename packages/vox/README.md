# @hashbrownai/vox

Voice Activity Detection (VAD) Audio Worklet with bundled WASM assets.

## Building

```bash
nx build vox
```

## Usage

```typescript
import { createVAD } from '@hashbrownai/vox';
import createModule from '@hashbrownai/vox/loader';

const vad = createVAD({
  mode: 2,
  onDecision: (d) => console.log(d === 1 ? 'VOICE' : 'NO VOICE'),
  // basePath is optional; defaults to the packaged assets
});

await vad.initialize(createModule);
await vad.start();
```

### Custom asset path

If you need to host the assets yourself, pass a `basePath` so the loader can find the files:

```typescript
const vad = createVAD({
  basePath: '/assets/vox/', // where vad_audio_worklet.* are served
});
```

## Serving requirements (WASM + AudioWorklet)

Any server (dev or production) that serves the VAD assets must:

- Serve `.wasm` with `Content-Type: application/wasm`.
- Enable cross-origin isolation for threads/SharedArrayBuffer by sending these headers on HTML and asset responses:
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Embedder-Policy: require-corp`
- If hosting assets from a different origin, also add `Cross-Origin-Resource-Policy: cross-origin` on the asset responses.

Example (nginx):

```
types { application/wasm wasm; }

add_header Cross-Origin-Opener-Policy "same-origin" always;
add_header Cross-Origin-Embedder-Policy "require-corp" always;
add_header Cross-Origin-Resource-Policy "cross-origin" always;

location /assets/vox/ {
  root /var/www/yourapp/dist/packages/vox/;  # adjust to your deploy path
  try_files $uri =404;
}
```

## Distribution layout

The published package ships:

- `index.mjs` / `index.cjs` / `index.d.ts` (entry points)
- `assets/vad_audio_worklet.{js,aw.js,ww.js,wasm}`
- Export map includes `.`, `./loader`, `./wasm`, `./worker`, `./async`, and `./package.json`.

## Key lessons (build, assets, servers) for future maintainers

These notes summarize everything needed to make the package build, ship assets, and load correctly in browsers.

### Package/build shape
- `package.json`:
  - `sideEffects: false`
  - Entrypoints: `main` → `index.cjs`, `module` → `index.mjs`, `types` → `index.d.ts`
  - Export map includes:
    - `.` → `index.{cjs,mjs,d.ts}`
    - `./loader` → `assets/vad_audio_worklet.js`
    - `./wasm` → `assets/vad_audio_worklet.wasm`
    - `./worker` → `assets/vad_audio_worklet.ww.js`
    - `./async` → `assets/vad_audio_worklet.aw.js`
    - `./package.json`
  - `files`: `README.md`, `LICENSE`, `package.json`, `index.*`, `assets/**/*`
- Rollup (Nx):
  - Emits `index.{cjs,mjs}` + types and copies `packages/vox/src/assets/**/*` to `dist/packages/vox/assets/`.
  - `tsconfig` uses `module: esnext` so rollup can emit both CJS/ESM.
  - Asset sources live in `packages/vox/src/assets/`; keep them in sync with `wasm/vad-audio-worklet/output/`.

### Runtime asset resolution
- Default runtime expects assets at the packaged path (workspace dev: `/dist/packages/vox/assets/`; published: alongside the package).
- `basePath` option lets consumers host assets elsewhere (CDN/custom public path).
- In Nx/Vite dev, make sure the dev server can read `dist/packages/vox/assets/` (fs.allow) and serves them with correct MIME.

### Server requirements (dev and prod)
- COOP/COEP required for AudioWorklet + threads/SharedArrayBuffer:
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Embedder-Policy: require-corp`
  - If assets are on a different origin, add `Cross-Origin-Resource-Policy: cross-origin` on asset responses.
- MIME types:
  - `.wasm` → `application/wasm`
  - `.js` (loaders) → `application/javascript`
- Ensure the built assets are actually hosted (e.g., `/dist/packages/vox/assets/`) and not falling back to HTML/404; use middleware if needed.

Example (nginx):
```
types { application/wasm wasm; }

add_header Cross-Origin-Opener-Policy "same-origin" always;
add_header Cross-Origin-Embedder-Policy "require-corp" always;
add_header Cross-Origin-Resource-Policy "cross-origin" always;

location /assets/vox/ {
  root /var/www/yourapp/dist/packages/vox/;  # adjust to your deploy path
  try_files $uri =404;
}
```
