# VAD Audio Worklet (Hashbrown)

Emscripten build for the VAD (voice activity detection) audio worklet used by
`@hashbrownai/vox`.

## Overview

This directory builds the WASM + worklet artifacts used by Hashbrown's VAD
pipeline. The generated files are promoted into `wasm/bin/vad-audio-worklet/`
and then copied into `packages/vox/src/assets/`, where the Vox package consumes
them at runtime.

Key artifacts:
- `output/vad_audio_worklet.wasm`
- `output/vad_audio_worklet.js`
- `output/vad_audio_worklet.aw.js`
- `output/vad_audio_worklet.ww.js`
- `output/vad_audio_worklet.single.js` (generated during promote)

## Prerequisites

- **Docker**: Docker installed and running
- **Node.js**: Node.js installed (required for test server with SharedArrayBuffer headers)
- **Web browser**: A browser with Web Audio API support for testing

## Building

This project uses Docker-only builds. No local Emscripten installation is required.

Simply run:

```bash
./build.sh
```

The build script will:
1. Build a Docker image with Emscripten SDK
2. Compile the C code to WebAssembly with audio worklet support
3. Output the compiled files to the `output/` directory
4. Patch the generated worklet and loader files via `patch-aw.js`

## Promoting

To publish a build into the repo's stable artifacts and Vox assets:

```bash
./promote.sh
```

The promote script:
1. Copies `output/` artifacts into `wasm/bin/vad-audio-worklet/`
2. Copies all `.js` files into the consumer asset directory (see `promote.sh`)
3. Regenerates the embedded single-file loader (`vad_audio_worklet.single.js`)

## Testing

After building, start a local HTTP server with the required headers for SharedArrayBuffer:

```bash
./test.sh
```

The test server sets the required HTTP headers for WebAssembly threads:
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

Then open your browser to `http://localhost:8000/test.html`.

**Note**: SharedArrayBuffer requires these headers to be set. The test server uses Node.js to provide them automatically.

The test page will:
1. Load the compiled WASM module
2. Display status messages
3. Allow you to start the audio context
4. Show live VAD decisions ("VOICE" / "NO VOICE")

## Files

- `main.c` - C source code for the audio worklet
- `CMakeLists.txt` - CMake build configuration
- `Dockerfile` - Docker configuration for building with Emscripten
- `build.sh` - Docker build script
- `test.html` - Minimal HTML/JavaScript test page
- `test.sh` - Test server script (starts Node.js server with required headers)
- `test-server.js` - Node.js HTTP server with SharedArrayBuffer headers
- `output/` - Generated build artifacts (created after building)
- `patch-aw.js` - Post-build patcher for the worklet + loader
- `promote.sh` - Copies artifacts into stable locations and regenerates the embedded loader
- `embed-singlefile.mjs` - Produces the single-file embedded loader

## Patch script (why these edits are required)

`patch-aw.js` makes three targeted changes to the generated output so it works
reliably in production builds and in npm-distributed packages.

1. Add a URL polyfill to `vad_audio_worklet.aw.js`.
   - **Change**: Injects a minimal `URL` polyfill when the worklet global scope
     does not provide one.
   - **Why (prod/npm)**: AudioWorkletGlobalScope is not guaranteed to expose
     `URL` across browsers and build setups. The embedded single-file loader uses
     `URL.createObjectURL` for worklet blobs, so the worklet must have a working
     `URL` implementation to avoid runtime failures in production builds.

2. Forward `{ type: 'integer' }` messages in the worklet bootstrap.
   - **Change**: Adds a small guard in the worklet message handler that echoes
     integer messages back to the main thread.
   - **Why (prod/npm)**: The wasm worker bootstrap uses message passing as part
     of the AudioWorklet initialization handshake. In production, the minified
     output can bypass this forwarding and stall initialization, resulting in
     timeouts. The patch ensures the handshake remains intact in optimized
     bundles.

3. Resolve `vad_audio_worklet.aw.js` via `locateFile(...)` in the loader.
   - **Change**: Rewrites `audioWorklet.addModule('vad_audio_worklet.aw.js')` to
     `audioWorklet.addModule(locateFile('vad_audio_worklet.aw.js'))`.
   - **Why (prod/npm)**: In npm packages and production builds, the loader is
     served from hashed or relocated paths. A literal string only works when the
     worklet file sits next to the loader on a known URL. `locateFile` is the
     Emscripten-approved mechanism for resolving assets under a configured base
     path, so the worklet can be found after bundling or CDN deployment.
