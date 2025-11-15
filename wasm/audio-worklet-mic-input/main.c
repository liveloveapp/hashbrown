#include <emscripten/webaudio.h>
#include <emscripten/em_asm.h>
#include <stdint.h>
#include <math.h>

uint8_t audioThreadStack[4096];
EMSCRIPTEN_WEBAUDIO_T audioContext;

void OnMessageFromAudioThread(int value) {
  EM_ASM({ window.logIntegerFromWorklet($0); }, value);
}

// Export AudioProcess so we can get its function pointer
int AudioProcess(int numInputs, const AudioSampleFrame *inputs,
                 int numOutputs, AudioSampleFrame *outputs,
                 int numParams, const AudioParamFrame *params,
                 void *userData) {
  static int frameCount = 0;
  const int FRAME_LENGTH = 128; // Web Audio API render quantum size
  
  // Process input audio if available
  if (numInputs > 0 && inputs != NULL && inputs[0].data != NULL) {
    const AudioSampleFrame *input = &inputs[0];
    int numChannels = input->numberOfChannels;
    
    // Calculate RMS (Root Mean Square) magnitude
    double sumSquares = 0.0;
    int totalSamples = 0;
    
    // Access data using the formula: data[channelIndex*128+i]
    for (int ch = 0; ch < numChannels; ch++) {
      for (int i = 0; i < FRAME_LENGTH; i++) {
        float sample = input->data[ch * FRAME_LENGTH + i];
        sumSquares += (double)sample * (double)sample;
        totalSamples++;
      }
    }
    
    if (totalSamples > 0) {
      // Calculate RMS
      double rms = sqrt(sumSquares / totalSamples);
      // Convert to integer magnitude (scale by 1000 for readability)
      int magnitude = (int)(rms * 1000);
      
      // Send magnitude every 16 frames (roughly 22 times per second at 44.1kHz)
      // This provides smooth, responsive updates for visual feedback
      if (frameCount % 16 == 0) {
        emscripten_audio_worklet_post_function_vi(0, OnMessageFromAudioThread, magnitude);
      }
    }
  }
  
  // Pass through audio to output (optional)
  if (numOutputs > 0 && outputs != NULL && numInputs > 0 && inputs != NULL) {
    const AudioSampleFrame *input = &inputs[0];
    AudioSampleFrame *output = &outputs[0];
    
    if (input->numberOfChannels == output->numberOfChannels && 
        input->data != NULL && output->data != NULL) {
      // Copy all samples: numberOfChannels * 128
      int totalSamples = input->numberOfChannels * FRAME_LENGTH;
      for (int i = 0; i < totalSamples; i++) {
        output->data[i] = input->data[i];
      }
    }
  }
  
  frameCount++;
  return 1;
}

// Store the worklet node so JavaScript can access it
EMSCRIPTEN_AUDIO_WORKLET_NODE_T workletNodeHandle = 0;

void AudioWorkletNodeCreated(EMSCRIPTEN_WEBAUDIO_T ctx, EMSCRIPTEN_AUDIO_WORKLET_NODE_T node, int success, void *userData) {
  (void)ctx; (void)userData;
  if (success) {
    workletNodeHandle = node;
    // Expose the native AudioContext to JavaScript
    // Emscripten stores it internally, we need to access it
    EM_ASM({
      try {
        var contextHandle = $0;
        var nodeHandle = $1;
        // EmAudio is in the module scope, we can access it here in EM_ASM
        // Store the AudioContext directly
        // EmAudio should be accessible in this scope
        try {
          if (typeof EmAudio !== 'undefined') {
            var ctx = EmAudio[contextHandle];
            if (ctx) {
              window.audioWorkletNativeContext = ctx;
              window.audioWorkletReady = true;
              window._emscriptenWorkletNode = nodeHandle;
              console.log('AudioContext stored from EmAudio, handle:', contextHandle);
            } else {
              console.warn('EmAudio[' + contextHandle + '] is undefined');
              window.audioWorkletReady = true;
              window._emscriptenWorkletNode = nodeHandle;
            }
          } else {
            console.warn('EmAudio is undefined in this scope');
            window.audioWorkletReady = true;
            window._emscriptenWorkletNode = nodeHandle;
          }
        } catch (e) {
          console.error('Error accessing EmAudio:', e);
          window.audioWorkletReady = true;
          window._emscriptenWorkletNode = nodeHandle;
        }
      } catch(e) {
        console.error('Error accessing native context:', e);
        window.audioWorkletReady = true;
        window._emscriptenWorkletNode = $1;
      }
    }, ctx, node);
  }
}

void AudioWorkletProcessorCreated(EMSCRIPTEN_WEBAUDIO_T ctx, int success, void *userData) {
  if (!success) {
    EM_ASM({ console.error('AudioWorkletProcessorCreated failed'); });
    return;
  }
  EM_ASM({ console.log('AudioWorkletProcessorCreated: processor "p" registered'); });
  int ch[1] = {1};
  // Change numberOfInputs to 1 to accept microphone input
  EmscriptenAudioWorkletNodeCreateOptions opts = {.numberOfInputs = 1, .numberOfOutputs = 1, .outputChannelCounts = ch};
  EMSCRIPTEN_AUDIO_WORKLET_NODE_T node = emscripten_create_wasm_audio_worklet_node(ctx, "p", &opts, AudioProcess, 0);
  EM_ASM({ console.log('AudioWorkletNode created, handle:', $0); }, node);
  
  if (node) {
    workletNodeHandle = node;
    // Set ready flag and try to get AudioContext
    EM_ASM({
      try {
        var contextHandle = $0;
        var nodeHandle = $1;
        console.log('Setting up AudioContext access, ctx handle:', contextHandle, 'node handle:', nodeHandle);
        
        // Try to get AudioContext from EmAudio
        var ctx = null;
        try {
          if (typeof EmAudio !== 'undefined' && EmAudio[contextHandle]) {
            ctx = EmAudio[contextHandle];
            console.log('Got AudioContext from EmAudio');
          }
        } catch (e) {
          console.log('EmAudio access error:', e.message);
        }
        
        // Try to get from node
        if (!ctx && typeof EmAudio !== 'undefined' && EmAudio[nodeHandle]) {
          var nodeObj = EmAudio[nodeHandle];
          if (nodeObj && nodeObj.context) {
            ctx = nodeObj.context;
            console.log('Got AudioContext from node object');
          }
        }
        
        // Store what we found
        if (ctx) {
          window.audioWorkletNativeContext = ctx;
        }
        window.audioWorkletReady = true;
        window._emscriptenWorkletNode = nodeHandle;
        window._emscriptenAudioContextHandle = contextHandle;
        console.log('audioWorkletReady set to true');
      } catch(e) {
        console.error('Error in AudioWorkletProcessorCreated setup:', e);
        window.audioWorkletReady = true;
        window._emscriptenWorkletNode = $1;
        window._emscriptenAudioContextHandle = $0;
      }
    }, ctx, node);
  } else {
    EM_ASM({ console.error('Failed to create AudioWorkletNode'); });
  }
}

void AudioThreadInitialized(EMSCRIPTEN_WEBAUDIO_T ctx, int success, void *userData) {
  EM_ASM({ console.log('AudioThreadInitialized called, success:', $0); }, success);
  if (!success) {
    EM_ASM({ console.error('AudioThreadInitialized failed'); });
    return;
  }
  EM_ASM({ console.log('Registering processor "p"...'); });
  WebAudioWorkletProcessorCreateOptions opts = {.name = "p"};
  emscripten_create_wasm_audio_worklet_processor_async(ctx, &opts, AudioWorkletProcessorCreated, 0);
}

void ResumeAudioContext() {
  if (audioContext && emscripten_audio_context_state(audioContext) != AUDIO_CONTEXT_STATE_RUNNING) {
    emscripten_resume_audio_context_sync(audioContext);
  }
}

// Function to get the native AudioContext - exposed to JavaScript
void GetNativeAudioContext() {
  EM_ASM({
    // Emscripten stores the native AudioContext internally
    // We can access it through the module's WebAudio API
    // The native context is the actual AudioContext object used by Emscripten
    try {
      // Access through Emscripten's internal WebAudio state
      // The context pointer points to an internal structure that contains the native context
      var ctxPtr = Module._emscripten_webaudio_get_native_context ? 
                   Module._emscripten_webaudio_get_native_context($0) : null;
      
      // Alternative: access through the module's internal state
      // Emscripten might store it in a global or module property
      if (!ctxPtr && Module.ctx) {
        ctxPtr = Module.ctx;
      }
      
      // Store it for JavaScript to use
      if (ctxPtr) {
        window.audioWorkletNativeContext = ctxPtr;
      } else {
        // Fallback: try to access it through the AudioWorklet
        // The worklet processor is registered, so we can get the context from it
        console.warn('Could not get native context directly, will try alternative method');
      }
    } catch(e) {
      console.error('Error getting native context:', e);
    }
  }, audioContext);
}

// Expose the context handle to JavaScript
int GetAudioContextHandle() {
  return audioContext;
}

int main() {
  EM_ASM({ console.log('main() called, creating audio context...'); });
  
  // Create AudioContext with default settings (0 = NULL = use browser default)
  // To set a specific sample rate, use:
  // EmscriptenWebAudioCreateAttributes opts = {.latencyHint = NULL, .sampleRate = 16000};
  // audioContext = emscripten_create_audio_context(&opts);
  audioContext = emscripten_create_audio_context(0);
  if (!audioContext) {
    EM_ASM({ console.error('Failed to create audio context'); });
    return 1;
  }
  EM_ASM({ console.log('Audio context created, handle:', $0); }, audioContext);
  
  // Store the context handle and expose EmAudio on Module
  EM_ASM({
    window._emscriptenAudioContextHandle = $0;
    console.log('Stored context handle:', $0);
    // Expose EmAudio on Module so JavaScript can access it
    // EmAudio is a local variable, we need to make it accessible
    // We'll do this by storing a reference in the module
    if (typeof EmAudio !== 'undefined') {
      Module.EmAudio = EmAudio;
      console.log('Exposed EmAudio on Module');
    } else {
      console.warn('EmAudio not available in main()');
    }
  }, audioContext);
  
  EM_ASM({ console.log('Starting audio worklet thread...'); });
  emscripten_start_wasm_audio_worklet_thread_async(audioContext, audioThreadStack, sizeof(audioThreadStack), AudioThreadInitialized, 0);
  EM_ASM({ console.log('Audio worklet thread start requested'); });
  return 0;
}
