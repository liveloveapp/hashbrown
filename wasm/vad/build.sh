#!/bin/bash

set -e

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

echo "================================================"
echo "WebRTC VAD WASM Builder"
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

# Copy necessary build files to staging area
STAGING_DIR="$SCRIPT_DIR/.staging"
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR"

echo "Preparing build files..."
cp "$SCRIPT_DIR/CMakeLists.txt" "$STAGING_DIR/"
cp "$SCRIPT_DIR/rtc_stubs.c" "$STAGING_DIR/"
cp "$SCRIPT_DIR/Dockerfile" "$STAGING_DIR/"
cp "$SCRIPT_DIR/vad_wrapper.js" "$STAGING_DIR/"

# Build the Docker image
echo ""
echo "Building Docker image (no cache - fetching latest WebRTC)..."
docker build --no-cache --pull -t webrtc-vad-builder "$STAGING_DIR"

# Run the container and extract build artifacts
echo ""
echo "Running build container..."
docker run --rm -v "$OUTPUT_DIR:/dist" webrtc-vad-builder

# Process build information
echo ""
echo "Processing build information..."

# Read commit SHA from build output
if [ -f "$OUTPUT_DIR/webrtc_commit_sha.txt" ]; then
    COMMIT_SHA=$(cat "$OUTPUT_DIR/webrtc_commit_sha.txt")
    BUILD_DATE=$(jq -r '.build_date' "$OUTPUT_DIR/build-info.json")
    
    echo "WebRTC Commit SHA: $COMMIT_SHA"
    echo "Build Date: $BUILD_DATE"
    
    # Inject build info into vad_wrapper.js
    sed -e "s/__WEBRTC_COMMIT_SHA__/$COMMIT_SHA/g" \
        -e "s/__BUILD_DATE__/$BUILD_DATE/g" \
        "$STAGING_DIR/vad_wrapper.js" > "$OUTPUT_DIR/vad_wrapper.js"
    
    echo "Build information injected into vad_wrapper.js"
else
    echo "Warning: Build info not found, copying wrapper without build info"
    cp "$STAGING_DIR/vad_wrapper.js" "$OUTPUT_DIR/vad_wrapper.js"
fi

# Clean up staging directory
rm -rf "$STAGING_DIR"

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

