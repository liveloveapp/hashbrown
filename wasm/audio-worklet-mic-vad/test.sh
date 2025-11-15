#!/bin/bash

# HTTP server to test the audio worklet with SharedArrayBuffer support
# This script starts a Node.js server with required headers for WebAssembly threads

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
OUTPUT_DIR="$SCRIPT_DIR/output"

# Check if output directory exists
if [ ! -d "$OUTPUT_DIR" ]; then
    echo "Error: Output directory not found. Please run build.sh first."
    exit 1
fi

# Check for Node.js (required for SharedArrayBuffer headers)
if command -v node &> /dev/null; then
    chmod +x "$SCRIPT_DIR/test-server.js"
    cd "$SCRIPT_DIR" && node test-server.js
else
    echo "Error: Node.js not found. Node.js is required for SharedArrayBuffer support."
    echo ""
    echo "The audio worklet requires these HTTP headers:"
    echo "  - Cross-Origin-Opener-Policy: same-origin"
    echo "  - Cross-Origin-Embedder-Policy: require-corp"
    echo ""
    echo "Please install Node.js to run the test server."
    exit 1
fi


