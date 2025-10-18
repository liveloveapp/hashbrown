FROM emscripten/emsdk:3.1.50

# Install dependencies
RUN apt-get update && apt-get install -y \
    git \
    cmake \
    make \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /build

# Clone WebRTC repository
RUN git clone --depth 1 https://webrtc.googlesource.com/src.git webrtc

# Copy build files into the WebRTC repository
WORKDIR /build/webrtc

# Capture WebRTC commit SHA
RUN git rev-parse HEAD > /build/webrtc_commit_sha.txt && \
    echo "WebRTC Commit SHA: $(cat /build/webrtc_commit_sha.txt)"

# Create vad_wasm directory and copy build files
RUN mkdir -p vad_wasm
COPY CMakeLists.txt vad_wasm/CMakeLists.txt
COPY rtc_stubs.c vad_wasm/rtc_stubs.c

# Build the WASM module
WORKDIR /build/webrtc/vad_wasm
RUN mkdir -p build && cd build && \
    emcmake cmake .. -DCMAKE_BUILD_TYPE=Release && \
    emmake make -j$(nproc)

# Copy build artifacts to output directory
RUN mkdir -p /output && \
    cp build/webrtc_vad.js /output/ && \
    cp build/webrtc_vad.wasm /output/ && \
    cp /build/webrtc_commit_sha.txt /output/webrtc_commit_sha.txt && \
    printf "{\n  \"webrtc_commit_sha\": \"$(cat /build/webrtc_commit_sha.txt)\",\n  \"build_date\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\"\n}\n" > /output/build-info.json

# Set the output directory as a volume
VOLUME /output

# Default command: copy files to volume
CMD cp /output/* /dist/ 2>/dev/null || echo "Build artifacts copied to /dist"

