# WASM Modules

This directory contains WebAssembly modules used by the project.

## Directory Structure

### `bin/`

Contains **locked/stable** built WASM modules for use by the rest of the project. These are committed to the repository for use by packages.

**Note:** Use the relevant `promote.sh` script to update these files when you want to release a new stable version.

### `vad/`

Contains the **build system** for creating a fresh VAD WASM build from the latest WebRTC source code.

Use this directory to:

- Build new versions of the WASM modules
- Test changes and updates
- Promote builds to stable using `promote.sh`

See [`vad/README.md`](./vad/README.md) for detailed build instructions.
