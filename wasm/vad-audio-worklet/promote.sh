#!/bin/bash

# Promote script - copies built WASM modules from output/ to ../bin/
# This makes a fresh build the new stable version

set -e

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
OUTPUT_DIR="$SCRIPT_DIR/output"
BIN_DIR="$SCRIPT_DIR/../bin/vad-audio-worklet"
VOX_ASSETS_DIR="$SCRIPT_DIR/../../packages/vox/src/assets"

echo "================================================"
echo "WASM Module Promotion"
echo "================================================"
echo ""

# Check if output files exist
REQUIRED_FILES=(
    "vad_audio_worklet.js"
    "vad_audio_worklet.aw.js"
)
MISSING_FILES=()

for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$OUTPUT_DIR/$file" ]; then
        MISSING_FILES+=("$file")
    fi
done

if [ ${#MISSING_FILES[@]} -ne 0 ]; then
    echo "Error: Required build files not found in output/ directory:"
    for file in "${MISSING_FILES[@]}"; do
        echo "  - $file"
    done
    echo ""
    echo "Please run './build.sh' first to build the WASM module."
    exit 1
fi

# Show what's being promoted
echo "Promoting build to stable (../bin/vad-audio-worklet/):"
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
echo "Copying files to ../bin/vad-audio-worklet/..."

# Copy main module files
cp "$OUTPUT_DIR/vad_audio_worklet.js" "$BIN_DIR/"
if [ -f "$OUTPUT_DIR/vad_audio_worklet.wasm" ]; then
    cp "$OUTPUT_DIR/vad_audio_worklet.wasm" "$BIN_DIR/"
fi

# Copy audio worklet files
cp "$OUTPUT_DIR/vad_audio_worklet.aw.js" "$BIN_DIR/"
if [ -f "$OUTPUT_DIR/vad_audio_worklet.ww.js" ]; then
    cp "$OUTPUT_DIR/vad_audio_worklet.ww.js" "$BIN_DIR/"
fi
if [ -f "$OUTPUT_DIR/vad_audio_worklet.worker.js" ]; then
    cp "$OUTPUT_DIR/vad_audio_worklet.worker.js" "$BIN_DIR/"
fi

# Copy build info
if [ -f "$OUTPUT_DIR/build-info.json" ]; then
    cp "$OUTPUT_DIR/build-info.json" "$BIN_DIR/"
fi
if [ -f "$OUTPUT_DIR/webrtc_commit_sha.txt" ]; then
    cp "$OUTPUT_DIR/webrtc_commit_sha.txt" "$BIN_DIR/"
fi

echo "Done!"
echo ""

# Copy .js files to vox assets folder
echo "Copying .js files to packages/vox/src/assets/..."
mkdir -p "$VOX_ASSETS_DIR"

# Copy all .js files from bin to assets
for js_file in "$BIN_DIR"/*.js; do
    if [ -f "$js_file" ]; then
        filename=$(basename "$js_file")
        cp "$js_file" "$VOX_ASSETS_DIR/"
        echo "  Copied $filename"
    fi
done

echo "Done copying .js files to assets!"
echo ""

# Run embed-singlefile.mjs to generate embedded loader
echo "Generating embedded single-file loader..."
if [ -f "$SCRIPT_DIR/embed-singlefile.mjs" ]; then
    node "$SCRIPT_DIR/embed-singlefile.mjs"
    if [ $? -ne 0 ]; then
        echo "Error: Failed to generate embedded single-file loader"
        exit 1
    fi
else
    echo "Warning: embed-singlefile.mjs not found at $SCRIPT_DIR/embed-singlefile.mjs"
fi
echo ""

# Extract commit SHA for commit message if available
COMMIT_SHA=""
if [ -f "$OUTPUT_DIR/webrtc_commit_sha.txt" ]; then
    COMMIT_SHA=$(cat "$OUTPUT_DIR/webrtc_commit_sha.txt")
fi

echo "================================================"
echo "Files promoted successfully!"
echo "================================================"
echo ""
echo "Next steps:"
echo ""
if [ -n "$COMMIT_SHA" ]; then
    echo "  git add wasm/bin/vad-audio-worklet/"
    echo "  git commit -m \"Update vad-audio-worklet WASM to WebRTC commit $COMMIT_SHA\""
else
    echo "  git add wasm/bin/vad-audio-worklet/"
    echo "  git commit -m \"Update vad-audio-worklet WASM\""
fi
echo ""

