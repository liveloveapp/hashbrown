cmake_minimum_required(VERSION 3.16)
project(audio_worklet_essentials)

# Set C standard
set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

# Emscripten specific settings
if(EMSCRIPTEN)
    set(CMAKE_EXECUTABLE_SUFFIX ".js")
    set(EMSCRIPTEN_LINK_FLAGS "-O3 -s WASM=1 -s AUDIO_WORKLET=1 -s WASM_WORKERS=1 -s EXPORTED_RUNTIME_METHODS='[\"ccall\",\"cwrap\"]' -s EXPORTED_FUNCTIONS='[\"_main\",\"_malloc\",\"_free\",\"_ResumeAudioContext\",\"_OnMessageFromAudioThread\",\"_GetNativeAudioContext\",\"_GetAudioContextHandle\",\"_AudioProcess\"]' -s ALLOW_MEMORY_GROWTH=1 -s MODULARIZE=1 -s EXPORT_ES6=1 -s USE_ES6_IMPORT_META=1 -s EXPORT_NAME='createAudioWorkletModule' --no-entry")
    set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -O3")
endif()

# Source files
set(SOURCES
    main.c
)

# Create the WASM module
add_executable(audio_worklet_essentials ${SOURCES})
if(EMSCRIPTEN)
    set_target_properties(audio_worklet_essentials PROPERTIES LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS}")
endif()

