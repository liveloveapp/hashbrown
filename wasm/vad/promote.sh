#!/bin/bash

# Promote script - copies built WASM modules from output/ to ../bin/
# This makes a fresh build the new stable version

set -e

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
OUTPUT_DIR="$SCRIPT_DIR/output"
BIN_DIR="$SCRIPT_DIR/../bin/vad"

echo "================================================"
echo "WASM Module Promotion"
echo "================================================"
echo ""

# Check if output files exist
if [ ! -f "$OUTPUT_DIR/webrtc_vad.js" ] || [ ! -f "$OUTPUT_DIR/webrtc_vad.wasm" ] || [ ! -f "$OUTPUT_DIR/vad_wrapper.js" ]; then
    echo "Error: Build files not found in output/ directory."
    echo "Please run './build.sh' first to build the WASM module."
    exit 1
fi

# Show what's being promoted
echo "Promoting build to stable (../bin/vad/):"
echo ""
if [ -f "$OUTPUT_DIR/build-info.json" ]; then
    cat "$OUTPUT_DIR/build-info.json"
    echo ""
else
    echo "Warning: build-info.json not found"
fi

# Show current stable version if it exists
if [ -f "$BIN_DIR/build-info.json" ]; then
    echo ""
    echo "Current stable version:"
    cat "$BIN_DIR/build-info.json"
    echo ""
fi

# Confirm promotion
echo ""
read -p "Promote this build to stable? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Promotion cancelled."
    exit 0
fi

# Create bin directory if it doesn't exist
mkdir -p "$BIN_DIR"

# Copy files
echo ""
echo "Copying files to ../bin/vad/..."
cp "$OUTPUT_DIR/webrtc_vad.js" "$BIN_DIR/"
cp "$OUTPUT_DIR/webrtc_vad.wasm" "$BIN_DIR/"
cp "$OUTPUT_DIR/vad_wrapper.js" "$BIN_DIR/"
cp "$OUTPUT_DIR/build-info.json" "$BIN_DIR/"
cp "$OUTPUT_DIR/webrtc_commit_sha.txt" "$BIN_DIR/"

echo "Done!"
echo ""

# Extract commit SHA for commit message
COMMIT_SHA=$(cat "$OUTPUT_DIR/webrtc_commit_sha.txt")

echo "================================================"
echo "Files promoted successfully!"
echo "================================================"
echo ""
echo "Next steps:"
echo ""
echo "  git add wasm/bin/vad/"
echo "  git commit -m \"Update VAD WASM to WebRTC commit $COMMIT_SHA\""
echo ""


