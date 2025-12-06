# Inspiration: Shipping WASM Packages on npm

Use these patterns from `quickjs-emscripten` as a reference when building a package that must publish `.wasm`, `.aw.js`, `.ww.js`, and the Emscripten-generated JS loader.

## Layout & Build Outputs

- Keep compiled assets in `dist/` and include only publishable files via `files` in `package.json` (e.g., `"files": ["LICENSE", "README.md", "dist/**/*", "!dist/*.tsbuildinfo"]`).
- Stage Emscripten outputs consistently: `dist/emscripten-module.wasm`, `dist/emscripten-module.js` (or `.mjs/.cjs`), plus any worker/async variants like `.aw.js` or `.ww.js`.
- Avoid committing artifacts; add `dist/` to `.gitignore`, but ensure `files` and `exports` cover what npm should receive.

## package.json Exports & Metadata

- Provide explicit export map entries for each consumer path, mirroring `packages/variant-quickjs-wasmfile-release-sync/package.json`:
  ```json
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs",
      "default": "./dist/index.cjs"
    },
    "./wasm": "./dist/emscripten-module.wasm",
    "./loader": {
      "import": "./dist/emscripten-module.mjs",
      "require": "./dist/emscripten-module.cjs"
    },
    "./worker": "./dist/emscripten-module.ww.js",
    "./async": "./dist/emscripten-module.aw.js",
    "./package.json": "./package.json"
  }
  ```
- Match `main`, `module`, and `types` to the files you ship; keep `sideEffects: false` if tree-shaking-safe.

## Build Pipeline Guidance

- Use a two-phase build: native/WASM (e.g., `make` calling Emscripten) then JS bundling (`tsup`, `rollup`, `esbuild`).
- In this repo, variant packages run `make` then `tsup` to move the wasm and generated JS into `dist/`. Mirror that: one command to build binaries, one to bundle/emit types.
- Generate declarations (`.d.ts`) alongside JS to support both ESM and CJS entry points.

## Ensuring Assets Land in the Tarball

- Add a `tarball` or `pack` check similar to root `yarn tarball`: build everything, then run `npm pack` (or `yarn pack`) into `build/tar/` and inspect contents.
- Automated guard: a script like `check:packages` can assert that `dist/` exists and contains the wasm and loader files before publishing.

## Testing & Smoke Checks

- Run unit tests with the built artifacts, not the source. In this repo, `test:node` consumes built outputs via a temporary package.json; adapt by copying your built `dist/` into a throwaway consumer and running runtime tests.
- Add smoke tests that import both `import` and `require` paths, and explicitly load the wasm file to catch missing `files` or `exports` entries.

## Publishing Workflow

- Sequence: `clean` → `build` (native + JS) → `test` → `pack` → `publish`.
- Example scripts (adapt from this repo):
  ```json
  "scripts": {
    "build": "yarn build:native && yarn build:js",
    "build:native": "make",
    "build:js": "tsup",
    "test": "vitest run",
    "pack:check": "npm pack --dry-run",
    "prepare": "yarn clean && yarn build"
  }
  ```
- For multi-package setups, prefer workspace iterators (`yarn workspaces foreach`) to build/test every variant consistently.

## Tips Specific to Binary Assets

- Keep filenames stable; consumers may `import './wasm'` or `require('./worker')`. Avoid renaming without a compatibility export.
- If producing multiple wasm flavors (debug/release, asyncify), mirror the pattern `packages/variant-*` uses: separate packages or paths for each flavor to avoid bloated single bundles.
- Document the expected loader usage (e.g., `createEmscriptenModule({ locateFile })`) and provide defaults that resolve the wasm relative to the JS entry.
