#!/bin/bash

# Docker-only build script for Audio Worklet Essentials
# This script uses Docker to build the WASM module without requiring local Emscripten

set -e

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "================================================"
echo "VAD Audio Worklet WASM Builder (Docker)"
echo "================================================"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "Error: Docker is not running. Please start Docker and try again."
    exit 1
fi

# Create output directory
OUTPUT_DIR="$SCRIPT_DIR/output"
mkdir -p "$OUTPUT_DIR"

# Build the Docker image and extract artifacts
echo "Building Docker image..."
docker build -t vad-audio-worklet-builder "$SCRIPT_DIR"

# Run the container and extract build artifacts
echo ""
echo "Running build container..."
docker run --rm -v "$OUTPUT_DIR:/dist" vad-audio-worklet-builder

# Update build info to indicate Docker build
if [ -f "$OUTPUT_DIR/build-info.json" ]; then
    # Add build_method to existing build-info.json
    if command -v jq &> /dev/null; then
        jq '. + {"build_method": "docker"}' "$OUTPUT_DIR/build-info.json" > "$OUTPUT_DIR/build-info.json.tmp" && mv "$OUTPUT_DIR/build-info.json.tmp" "$OUTPUT_DIR/build-info.json"
    else
        # Fallback if jq is not available
        sed -i.bak 's/}$/,\n  "build_method": "docker"\n}/' "$OUTPUT_DIR/build-info.json" && rm -f "$OUTPUT_DIR/build-info.json.bak"
    fi
fi

# Patch generated .aw.js and loader files
if [ -f "$OUTPUT_DIR/vad_audio_worklet.aw.js" ]; then
    echo ""
    echo "Patching generated audio worklet artifacts..."
    node "$SCRIPT_DIR/patch-aw.js"
fi

echo ""
echo "================================================"
echo "Build completed successfully!"
echo "================================================"
echo ""
echo "Output files are available in:"
echo "  $OUTPUT_DIR"
echo ""
echo "Generated files:"
ls -lh "$OUTPUT_DIR"
echo ""
if [ -f "$OUTPUT_DIR/build-info.json" ]; then
    echo "Build Information:"
    cat "$OUTPUT_DIR/build-info.json"
    echo ""
fi
