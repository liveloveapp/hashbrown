#include <emscripten/webaudio.h>
#include <emscripten/console.h>
#include <emscripten/em_asm.h>
#include <string.h>
#include <stdbool.h>
#include <stdint.h>

// Stack for the audio worklet thread
uint8_t audioThreadStack[4096];

// Audio context
EMSCRIPTEN_WEBAUDIO_T audioContext;

// Function to handle messages from the audio worklet thread (with integer)
// This will be called on the main thread when emscripten_audio_worklet_post_function_vi is used
// The function is posted from the audio worklet thread and executed on the main thread
void OnMessageFromAudioThread(int value) {
  // Log the integer value - this runs on the main thread
  // We'll use EM_ASM to call JavaScript to log it
  EM_ASM({
    if (typeof window !== 'undefined' && window.logIntegerFromWorklet) {
      window.logIntegerFromWorklet($0);
    } else {
      console.log('Received integer from audio worklet:', $0);
    }
  }, value);
}

// Function to handle messages from the audio worklet thread (no parameters)
void OnMessageFromAudioThreadVoid(void) {
  emscripten_console_log("=== Hello World from C audio worklet thread! ===");
}

// Simple audio processing callback (does nothing, just sends message)
// This gets called periodically when audio is running
int AudioProcess(int numInputs, const AudioSampleFrame *inputs,
                 int numOutputs, AudioSampleFrame *outputs,
                 int numParams, const AudioParamFrame *params,
                 void *userData) {
  // Send an integer value to main thread only once
  // We use a static flag to ensure it only sends once
  static int messageSent = 0;
  if (!messageSent) {
    // Send an integer value (42) to the main thread using Emscripten's API
    // emscripten_audio_worklet_post_function_vi posts a function call with one integer parameter
    // The 'vi' suffix means: void return type, one int parameter
    int valueToSend = 42;
    emscripten_audio_worklet_post_function_vi(0, OnMessageFromAudioThread, valueToSend);
    messageSent = 1;
  }
  
  // Don't process any audio yet - just return 1 to keep the node running
  return 1;
}

// Called when the audio worklet node is created
void AudioWorkletNodeCreated(EMSCRIPTEN_WEBAUDIO_T audioContext, EMSCRIPTEN_AUDIO_WORKLET_NODE_T node, int success, void *userData) {
  if (!success) {
    emscripten_console_error("Failed to create audio worklet node");
    return;
  }
  
  emscripten_console_log("Audio worklet node created successfully!");
  
  // Note: Don't call emscripten_audio_worklet_post_function_v from here
  // because this callback runs on the main thread, not in the audio worklet context.
  // Messages should be sent from within AudioProcess callback instead.
}

// Called when the audio worklet processor is created
void AudioWorkletProcessorCreated(EMSCRIPTEN_WEBAUDIO_T audioContext, int success, void *userData) {
  if (!success) {
    emscripten_console_error("Failed to create audio worklet processor");
    return;
  }
  
  emscripten_console_log("Audio worklet processor created successfully!");
  
  // Create options for the audio worklet node
  int outputChannelCounts[1] = { 1 };
  EmscriptenAudioWorkletNodeCreateOptions options = {
    .numberOfInputs = 0,
    .numberOfOutputs = 1,
    .outputChannelCounts = outputChannelCounts
  };
  
  // Create the audio worklet node
  EMSCRIPTEN_AUDIO_WORKLET_NODE_T node = emscripten_create_wasm_audio_worklet_node(audioContext,
                                                                                   "hello-processor",
                                                                                   &options,
                                                                                   AudioProcess,
                                                                                   0);
  if (node) {
    AudioWorkletNodeCreated(audioContext, node, 1, 0);
  } else {
    AudioWorkletNodeCreated(audioContext, 0, 0, 0);
  }
}

// Called when the audio worklet thread is initialized
void AudioThreadInitialized(EMSCRIPTEN_WEBAUDIO_T audioContext, int success, void *userData) {
  if (!success) {
    emscripten_console_error("Failed to initialize audio worklet thread");
    return;
  }
  
  emscripten_console_log("Audio worklet thread initialized successfully!");
  
  // Create the audio worklet processor
  WebAudioWorkletProcessorCreateOptions opts = {
    .name = "hello-processor",
  };
  
  emscripten_create_wasm_audio_worklet_processor_async(audioContext,
                                                       &opts,
                                                       AudioWorkletProcessorCreated,
                                                       0);
}

// Function to resume audio context (callable from JavaScript)
void ResumeAudioContext() {
  if (!audioContext) {
    emscripten_console_error("Audio context not created yet");
    return;
  }
  
  if (emscripten_audio_context_state(audioContext) != AUDIO_CONTEXT_STATE_RUNNING) {
    emscripten_resume_audio_context_sync(audioContext);
    emscripten_console_log("Audio context resumed");
  } else {
    emscripten_console_log("Audio context already running");
  }
}

// Main function
int main() {
  // Create audio context
  audioContext = emscripten_create_audio_context(0);
  
  if (!audioContext) {
    emscripten_console_error("Failed to create audio context");
    return 1;
  }
  
  emscripten_console_log("Audio context created");
  
  // Start the audio worklet thread
  emscripten_start_wasm_audio_worklet_thread_async(audioContext,
                                                   audioThreadStack,
                                                   sizeof(audioThreadStack),
                                                   AudioThreadInitialized,
                                                   0);
  
  return 0;
}

