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

# Create audio_worklet_vad directory and copy build files
RUN mkdir -p audio_worklet_vad
COPY CMakeLists.txt audio_worklet_vad/CMakeLists.txt
COPY main.c audio_worklet_vad/main.c
COPY rtc_stubs.c audio_worklet_vad/rtc_stubs.c

# Build the WASM module
WORKDIR /build/webrtc/audio_worklet_vad
RUN mkdir -p build && cd build && \
    emcmake cmake .. -DCMAKE_BUILD_TYPE=Release && \
    emmake make -j$(nproc)

# Create output directory and copy build artifacts
RUN mkdir -p /output && \
    cp build/audio_worklet_essentials.js /output/ && \
    cp build/audio_worklet_essentials.wasm /output/ 2>/dev/null || true && \
    cp build/audio_worklet_essentials.worker.js /output/ 2>/dev/null || true && \
    cp build/audio_worklet_essentials.ww.js /output/ 2>/dev/null || true && \
    cp build/audio_worklet_essentials.aw.js /output/ 2>/dev/null || true && \
    cp /build/webrtc_commit_sha.txt /output/webrtc_commit_sha.txt && \
    BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ") && \
    printf "{\n  \"webrtc_commit_sha\": \"$(cat /build/webrtc_commit_sha.txt)\",\n  \"build_date\": \"$BUILD_DATE\",\n  \"build_method\": \"docker\"\n}\n" > /output/build-info.json

# Default command: copy files to mounted volume
CMD cp -r /output/* /dist/ 2>/dev/null || (echo "Build artifacts:" && ls -lh /output && cp -r /output/* /dist/)


