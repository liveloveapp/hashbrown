# Audio Worklet Essentials

A bare-bones Emscripten project for testing Web Audio API Audio Worklets with WebAssembly.

## Overview

This project demonstrates the minimal setup for an Emscripten-based audio worklet that can communicate with JavaScript. Currently, it only tests the message passing functionality - no audio processing is implemented yet.

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
4. Show "Hello World" messages received from the audio worklet thread

## Files

- `main.c` - C source code for the audio worklet
- `CMakeLists.txt` - CMake build configuration
- `Dockerfile` - Docker configuration for building with Emscripten
- `build.sh` - Docker build script
- `test.html` - Minimal HTML/JavaScript test page
- `test.sh` - Test server script (starts Node.js server with required headers)
- `test-server.js` - Node.js HTTP server with SharedArrayBuffer headers
- `output/` - Generated build artifacts (created after building)

## Notes

- The audio worklet is created but doesn't process any audio yet
- This is the minimal setup to test function passing between the audio worklet thread and the main thread
- Audio processing callbacks will be added in future iterations

