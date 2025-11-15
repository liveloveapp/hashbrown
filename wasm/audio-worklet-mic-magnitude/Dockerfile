FROM emscripten/emsdk:3.1.50

# Install dependencies
RUN apt-get update && apt-get install -y \
    cmake \
    make \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /build

# Copy build files
COPY CMakeLists.txt /build/
COPY main.c /build/

# Build the WASM module
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
    BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ") && \
    echo "{\"build_date\": \"$BUILD_DATE\", \"build_method\": \"docker\"}" > /output/build-info.json

# Default command: copy files to mounted volume
CMD cp -r /output/* /dist/ 2>/dev/null || (echo "Build artifacts:" && ls -lh /output && cp -r /output/* /dist/)


