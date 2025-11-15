#include <emscripten/webaudio.h>
#include <emscripten/em_asm.h>
#include <stdint.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>
#include "common_audio/vad/include/webrtc_vad.h"

uint8_t audioThreadStack[4096];
EMSCRIPTEN_WEBAUDIO_T audioContext;

// VAD instance
VadInst* vadInstance = NULL;

// Target sample rate for VAD (16kHz)
#define VAD_SAMPLE_RATE 16000
// Frame length for VAD (10ms at 16kHz = 160 samples)
#define VAD_FRAME_LENGTH (VAD_SAMPLE_RATE / 100)

// Buffer for accumulating and resampling audio
#define MAX_BUFFER_SIZE 1024
static int16_t audioBuffer[MAX_BUFFER_SIZE];
static int audioBufferCount = 0;

void OnMessageFromAudioThread(int value) {
  // value is VAD decision: 1 = voice, 0 = no voice
  EM_ASM({ window.logVADDecisionFromWorklet($0); }, value);
}

// Simple downsampling from input sample rate to 16kHz
// Uses linear interpolation for better quality
void downsampleTo16kHz(const float* input, int inputLength, int inputSampleRate, 
                       int16_t* output, int* outputLength) {
  double ratio = (double)inputSampleRate / VAD_SAMPLE_RATE;
  int expectedOutputLength = (int)(inputLength / ratio);
  int outIdx = 0;
  
  // Iterate over output samples
  for (int i = 0; i < expectedOutputLength && outIdx < MAX_BUFFER_SIZE; i++) {
    // Calculate source index in input buffer
    double srcIndex = i * ratio;
    int srcIdx0 = (int)srcIndex;
    int srcIdx1 = srcIdx0 + 1;
    double fraction = srcIndex - srcIdx0;
    
    if (srcIdx1 < inputLength) {
      // Linear interpolation
      float sample = input[srcIdx0] * (1.0f - (float)fraction) + input[srcIdx1] * (float)fraction;
      // Convert float32 to int16
      int32_t sampleInt = (int32_t)(sample * 32768.0f);
      if (sampleInt > 32767) sampleInt = 32767;
      if (sampleInt < -32768) sampleInt = -32768;
      output[outIdx++] = (int16_t)sampleInt;
    } else if (srcIdx0 < inputLength) {
      // Last sample, no interpolation
      float sample = input[srcIdx0];
      int32_t sampleInt = (int32_t)(sample * 32768.0f);
      if (sampleInt > 32767) sampleInt = 32767;
      if (sampleInt < -32768) sampleInt = -32768;
      output[outIdx++] = (int16_t)sampleInt;
    } else {
      // No more input samples
      break;
    }
  }
  
  *outputLength = outIdx;
}

// Export AudioProcess so we can get its function pointer
int AudioProcess(int numInputs, const AudioSampleFrame *inputs,
                 int numOutputs, AudioSampleFrame *outputs,
                 int numParams, const AudioParamFrame *params,
                 void *userData) {
  const int FRAME_LENGTH = 128; // Web Audio API render quantum size
  
  // Process input audio if available and VAD is initialized
  if (numInputs > 0 && inputs != NULL && inputs[0].data != NULL && vadInstance != NULL) {
    const AudioSampleFrame *input = &inputs[0];
    int numChannels = input->numberOfChannels;
    
    // Use first channel for VAD processing
    const float* channelData = &input->data[0];
    
    // Get the actual sample rate from the audio context
    // For now, we'll assume 44.1kHz or 48kHz and detect it
    // We can get this from the AudioContext, but for simplicity, 
    // we'll use a reasonable default and handle both common rates
    // The actual rate will be available through the AudioContext
    // For now, assume 48kHz (common for modern browsers)
    int inputSampleRate = 48000; // Will be set properly via initialization
    
    // Downsample to 16kHz and convert to int16
    int16_t downsampledBuffer[MAX_BUFFER_SIZE];
    int downsampledLength = 0;
    downsampleTo16kHz(channelData, FRAME_LENGTH, inputSampleRate, 
                      downsampledBuffer, &downsampledLength);
    
    // Add to buffer
    int samplesToAdd = downsampledLength;
    if (audioBufferCount + samplesToAdd > MAX_BUFFER_SIZE) {
      samplesToAdd = MAX_BUFFER_SIZE - audioBufferCount;
    }
    memcpy(&audioBuffer[audioBufferCount], downsampledBuffer, 
           samplesToAdd * sizeof(int16_t));
    audioBufferCount += samplesToAdd;
    
    // Process 10ms frames (160 samples at 16kHz)
    while (audioBufferCount >= VAD_FRAME_LENGTH) {
      // Allocate memory for VAD processing
      int16_t* vadFrame = (int16_t*)malloc(VAD_FRAME_LENGTH * sizeof(int16_t));
      if (vadFrame) {
        memcpy(vadFrame, audioBuffer, VAD_FRAME_LENGTH * sizeof(int16_t));
        
        // Process with VAD
        int vadDecision = WebRtcVad_Process(vadInstance, VAD_SAMPLE_RATE, 
                                            vadFrame, VAD_FRAME_LENGTH);
        
        // Send VAD decision (1 = voice, 0 = no voice, -1 = error)
        if (vadDecision >= 0) {
          emscripten_audio_worklet_post_function_vi(0, OnMessageFromAudioThread, vadDecision);
        }
        
        free(vadFrame);
      }
      
      // Shift buffer
      memmove(audioBuffer, &audioBuffer[VAD_FRAME_LENGTH], 
              (audioBufferCount - VAD_FRAME_LENGTH) * sizeof(int16_t));
      audioBufferCount -= VAD_FRAME_LENGTH;
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

// Set VAD mode (0-3) - exposed to JavaScript
int SetVADMode(int mode) {
  if (vadInstance == NULL) {
    EM_ASM({ console.error('VAD not initialized'); });
    return -1;
  }
  if (mode < 0 || mode > 3) {
    EM_ASM({ console.error('VAD mode must be between 0 and 3'); }, mode);
    return -1;
  }
  int result = WebRtcVad_set_mode(vadInstance, mode);
  if (result == 0) {
    EM_ASM({ console.log('VAD mode set to:', $0); }, mode);
  } else {
    EM_ASM({ console.error('Failed to set VAD mode:', $0); }, result);
  }
  return result;
}

// Cleanup function to free VAD instance - exposed to JavaScript
void CleanupVAD() {
  if (vadInstance != NULL) {
    WebRtcVad_Free(vadInstance);
    vadInstance = NULL;
    EM_ASM({ console.log('VAD instance freed'); });
  }
}

int main() {
  EM_ASM({ console.log('main() called, creating audio context...'); });
  
  // Initialize VAD
  vadInstance = WebRtcVad_Create();
  if (!vadInstance) {
    EM_ASM({ console.error('Failed to create VAD instance'); });
    return 1;
  }
  
  int vadInitResult = WebRtcVad_Init(vadInstance);
  if (vadInitResult != 0) {
    EM_ASM({ console.error('Failed to initialize VAD:', $0); }, vadInitResult);
    WebRtcVad_Free(vadInstance);
    vadInstance = NULL;
    return 1;
  }
  
  // Set VAD mode to 2 (aggressive) - can be adjusted
  int vadModeResult = WebRtcVad_set_mode(vadInstance, 2);
  if (vadModeResult != 0) {
    EM_ASM({ console.warn('Failed to set VAD mode, using default'); });
  }
  
  EM_ASM({ console.log('VAD initialized successfully'); });
  
  // Create AudioContext with default settings (0 = NULL = use browser default)
  // To set a specific sample rate, use:
  // EmscriptenWebAudioCreateAttributes opts = {.latencyHint = NULL, .sampleRate = 16000};
  // audioContext = emscripten_create_audio_context(&opts);
  audioContext = emscripten_create_audio_context(0);
  if (!audioContext) {
    EM_ASM({ console.error('Failed to create audio context'); });
    WebRtcVad_Free(vadInstance);
    vadInstance = NULL;
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
