cmake_minimum_required(VERSION 3.16)
project(webrtc_vad_wasm)

# Set C++ standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Emscripten specific settings
if(EMSCRIPTEN)
    set(CMAKE_EXECUTABLE_SUFFIX ".js")
    set(EMSCRIPTEN_LINK_FLAGS "-O3 -s WASM=1 -s EXPORTED_RUNTIME_METHODS='[\"ccall\",\"cwrap\",\"HEAP8\",\"HEAP16\",\"HEAP32\",\"HEAPU8\",\"HEAPU16\",\"HEAPU32\"]' -s EXPORTED_FUNCTIONS='[\"_malloc\",\"_free\",\"_WebRtcVad_Create\",\"_WebRtcVad_Init\",\"_WebRtcVad_Free\",\"_WebRtcVad_set_mode\",\"_WebRtcVad_Process\",\"_WebRtcVad_ValidRateAndFrameLength\"]' -s ALLOW_MEMORY_GROWTH=1 -s MODULARIZE=1 -s EXPORT_NAME='createVADModule'")
    set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -O3")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -O3")
endif()

# Include directories
include_directories(
    ${CMAKE_CURRENT_SOURCE_DIR}/..
    ${CMAKE_CURRENT_SOURCE_DIR}/../common_audio/vad/include
    ${CMAKE_CURRENT_SOURCE_DIR}/../common_audio/vad
    ${CMAKE_CURRENT_SOURCE_DIR}/../common_audio/signal_processing/include
    ${CMAKE_CURRENT_SOURCE_DIR}/../common_audio/signal_processing
    ${CMAKE_CURRENT_SOURCE_DIR}/../rtc_base
)

# VAD source files
set(VAD_SOURCES
    ../common_audio/vad/webrtc_vad.c
    ../common_audio/vad/vad_core.c
    ../common_audio/vad/vad_filterbank.c
    ../common_audio/vad/vad_gmm.c
    ../common_audio/vad/vad_sp.c
)

# Signal processing sources (minimal set needed for VAD)
set(SP_SOURCES
    ../common_audio/signal_processing/spl_sqrt.c
    ../common_audio/signal_processing/energy.c
    ../common_audio/signal_processing/get_scaling_square.c
    ../common_audio/signal_processing/resample_48khz.c
    ../common_audio/signal_processing/resample_by_2.c
    ../common_audio/signal_processing/resample_by_2_internal.c
    ../common_audio/signal_processing/resample_fractional.c
    ../common_audio/signal_processing/spl_init.c
    ../common_audio/signal_processing/copy_set_operations.c
    ../common_audio/signal_processing/cross_correlation.c
    ../common_audio/signal_processing/downsample_fast.c
    ../common_audio/signal_processing/min_max_operations.c
    ../common_audio/signal_processing/vector_scaling_operations.c
    ../common_audio/signal_processing/real_fft.c
    ../common_audio/signal_processing/division_operations.c
)

# Create the WASM module
add_executable(webrtc_vad ${VAD_SOURCES} ${SP_SOURCES})
if(EMSCRIPTEN)
    set_target_properties(webrtc_vad PROPERTIES LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS}")
endif()
