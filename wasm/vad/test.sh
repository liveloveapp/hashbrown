#!/bin/bash

# Test script for WebRTC VAD WASM module
# Launches a local HTTP server to test the example.html

set -e

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Check if output files exist
if [ ! -f "$SCRIPT_DIR/output/webrtc_vad.js" ] || [ ! -f "$SCRIPT_DIR/output/webrtc_vad.wasm" ] || [ ! -f "$SCRIPT_DIR/output/vad_wrapper.js" ]; then
    echo "Error: WASM build files not found in output/ directory."
    echo "Please run ./build.sh first to build the WASM module."
    exit 1
fi

# Check if example.html exists
if [ ! -f "$SCRIPT_DIR/example.html" ]; then
    echo "Error: example.html not found."
    exit 1
fi

# Detect available Python version
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo "Error: Python not found. Please install Python to run the test server."
    exit 1
fi

# Get a free port (default to 8000)
PORT=8000

echo ""
echo "================================================"
echo "WebRTC VAD Test Server"
echo "================================================"
echo ""
echo "Starting HTTP server on http://localhost:$PORT"
echo ""
echo "Open your browser and navigate to:"
echo "  http://localhost:$PORT/example.html"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""
echo "================================================"
echo ""

# Change to the script directory and start the server
cd "$SCRIPT_DIR"
$PYTHON_CMD -m http.server $PORT

