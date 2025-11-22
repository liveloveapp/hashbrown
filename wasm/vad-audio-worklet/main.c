#include <emscripten/webaudio.h>
#include <emscripten/em_asm.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include "common_audio/vad/include/webrtc_vad.h"

/**
 * Target sample rate for VAD processing (16kHz).
 * WebRTC VAD supports 8kHz, 16kHz, or 32kHz sample rates.
 */
#define VAD_SAMPLE_RATE 16000

/**
 * Frame length for VAD processing (10ms at 16kHz = 160 samples).
 * VAD processes audio in 10ms frames.
 */
#define VAD_FRAME_LENGTH (VAD_SAMPLE_RATE / 100)

/**
 * Maximum size for internal audio buffers.
 */
#define MAX_BUFFER_SIZE 1024

/**
 * Web Audio API render quantum size (128 samples per frame).
 * This is the standard frame size for Web Audio API processing.
 */
#define FRAME_LENGTH 128

/**
 * Stack memory for the audio worklet thread.
 * Required by Emscripten's audio worklet implementation.
 */
uint8_t audioThreadStack[4096];

/**
 * Emscripten audio context handle.
 * Used to manage the Web Audio API context and worklet lifecycle.
 */
EMSCRIPTEN_WEBAUDIO_T audioContext;

/**
 * WebRTC VAD instance.
 * NULL if not initialized. Created in main() and freed in CleanupVAD().
 */
VadInst* vadInstance = NULL;

/**
 * Buffer for accumulating downsampled audio samples before VAD processing.
 * Used to collect samples until we have a full 10ms frame (160 samples at 16kHz).
 */
static int16_t audioBuffer[MAX_BUFFER_SIZE];

/**
 * Current number of samples in audioBuffer.
 * Tracks how many samples have been accumulated for the next VAD frame.
 */
static int audioBufferCount = 0;

/**
 * Callback function invoked when a VAD decision is ready to be sent to the main thread.
 * Called from the audio worklet thread via emscripten_audio_worklet_post_function_vi().
 * 
 * @param value VAD decision: 1 = voice detected, 0 = no voice, -1 = error
 */
void OnMessageFromAudioThread(int value) {
  EM_ASM({ window.logVADDecisionFromWorklet($0); }, value);
}

/**
 * Downsamples audio from the input sample rate to 16kHz and converts from float32 to int16.
 * Uses linear interpolation for better quality than simple decimation.
 * 
 * @param input Input audio samples (float32, typically 48kHz)
 * @param inputLength Number of input samples
 * @param inputSampleRate Input sample rate in Hz (typically 48000)
 * @param output Output buffer for downsampled int16 samples
 * @param outputLength Output parameter: number of samples written to output
 */
void downsampleTo16kHz(const float* input, int inputLength, int inputSampleRate, 
                       int16_t* output, int* outputLength) {
  double ratio = (double)inputSampleRate / VAD_SAMPLE_RATE;
  int expectedOutputLength = (int)(inputLength / ratio);
  int outIdx = 0;
  
  for (int i = 0; i < expectedOutputLength && outIdx < MAX_BUFFER_SIZE; i++) {
    double srcIndex = i * ratio;
    int srcIdx0 = (int)srcIndex;
    int srcIdx1 = srcIdx0 + 1;
    double fraction = srcIndex - srcIdx0;
    
    float sample;
    if (srcIdx1 < inputLength) {
      sample = input[srcIdx0] * (1.0f - (float)fraction) + input[srcIdx1] * (float)fraction;
    } else if (srcIdx0 < inputLength) {
      sample = input[srcIdx0];
    } else {
      break;
    }
    
    int32_t sampleInt = (int32_t)(sample * 32768.0f);
    if (sampleInt > 32767) sampleInt = 32767;
    if (sampleInt < -32768) sampleInt = -32768;
    output[outIdx++] = (int16_t)sampleInt;
  }
  *outputLength = outIdx;
}

/**
 * Main audio processing callback called by the Web Audio API for each render quantum (128 samples).
 * Processes microphone input through VAD and passes audio through to output.
 * 
 * Processing pipeline:
 * 1. Downsample input audio from 48kHz to 16kHz
 * 2. Accumulate samples until we have a full 10ms frame (160 samples)
 * 3. Process frame through WebRTC VAD
 * 4. Send VAD decision to main thread
 * 5. Pass audio through to output (optional)
 * 
 * @param numInputs Number of input channels
 * @param inputs Input audio frames
 * @param numOutputs Number of output channels
 * @param outputs Output audio frames
 * @param numParams Number of audio parameters
 * @param params Audio parameter frames
 * @param userData User data pointer (unused)
 * @return 1 to continue processing, 0 to stop
 */
int AudioProcess(int numInputs, const AudioSampleFrame *inputs,
                 int numOutputs, AudioSampleFrame *outputs,
                 int numParams, const AudioParamFrame *params,
                 void *userData) {
  if (numInputs > 0 && inputs != NULL && inputs[0].data != NULL && vadInstance != NULL) {
    const float* channelData = &inputs[0].data[0];
    int16_t downsampledBuffer[MAX_BUFFER_SIZE];
    int downsampledLength = 0;
    
    downsampleTo16kHz(channelData, FRAME_LENGTH, 48000, downsampledBuffer, &downsampledLength);
    
    int samplesToAdd = (audioBufferCount + downsampledLength > MAX_BUFFER_SIZE) 
                       ? MAX_BUFFER_SIZE - audioBufferCount : downsampledLength;
    memcpy(&audioBuffer[audioBufferCount], downsampledBuffer, samplesToAdd * sizeof(int16_t));
    audioBufferCount += samplesToAdd;
    
    while (audioBufferCount >= VAD_FRAME_LENGTH) {
      int16_t vadFrame[VAD_FRAME_LENGTH];
      memcpy(vadFrame, audioBuffer, VAD_FRAME_LENGTH * sizeof(int16_t));
      int vadDecision = WebRtcVad_Process(vadInstance, VAD_SAMPLE_RATE, vadFrame, VAD_FRAME_LENGTH);
      if (vadDecision >= 0) {
        emscripten_audio_worklet_post_function_vi(0, OnMessageFromAudioThread, vadDecision);
      }
      memmove(audioBuffer, &audioBuffer[VAD_FRAME_LENGTH], 
              (audioBufferCount - VAD_FRAME_LENGTH) * sizeof(int16_t));
      audioBufferCount -= VAD_FRAME_LENGTH;
    }
  }
  
  if (numOutputs > 0 && outputs != NULL && numInputs > 0 && inputs != NULL) {
    const AudioSampleFrame *input = &inputs[0];
    AudioSampleFrame *output = &outputs[0];
    if (input->numberOfChannels == output->numberOfChannels && 
        input->data != NULL && output->data != NULL) {
      int totalSamples = input->numberOfChannels * FRAME_LENGTH;
      for (int i = 0; i < totalSamples; i++) {
        output->data[i] = input->data[i];
      }
    }
  }
  return 1;
}

/**
 * Handle to the created audio worklet node.
 * Stored for potential future use, though currently not actively used.
 */
EMSCRIPTEN_AUDIO_WORKLET_NODE_T workletNodeHandle = 0;

/**
 * Callback invoked when the audio worklet node is created.
 * Exposes the native AudioContext and worklet node to JavaScript via window globals.
 * 
 * @param ctx Audio context handle
 * @param node Worklet node handle
 * @param success 1 if node was created successfully, 0 otherwise
 * @param userData User data pointer (unused)
 */
void AudioWorkletNodeCreated(EMSCRIPTEN_WEBAUDIO_T ctx, EMSCRIPTEN_AUDIO_WORKLET_NODE_T node, int success, void *userData) {
  (void)ctx; (void)userData;
  if (success) {
    workletNodeHandle = node;
    EM_ASM({
      try {
        if (typeof EmAudio !== 'undefined' && EmAudio[$0]) {
          window.audioWorkletNativeContext = EmAudio[$0];
        }
        window.audioWorkletReady = true;
        window._emscriptenWorkletNode = $1;
        window._emscriptenAudioContextHandle = $0;
      } catch(e) {
        window.audioWorkletReady = true;
        window._emscriptenWorkletNode = $1;
        window._emscriptenAudioContextHandle = $0;
      }
    }, ctx, node);
  }
}

/**
 * Callback invoked when the audio worklet processor is registered.
 * Creates the audio worklet node with 1 input and 1 output channel for microphone processing.
 * Sets up JavaScript globals for accessing the AudioContext and worklet node.
 * 
 * @param ctx Audio context handle
 * @param success 1 if processor was registered successfully, 0 otherwise
 * @param userData User data pointer (unused)
 */
void AudioWorkletProcessorCreated(EMSCRIPTEN_WEBAUDIO_T ctx, int success, void *userData) {
  if (!success) return;
  int ch[1] = {1};
  EmscriptenAudioWorkletNodeCreateOptions opts = {.numberOfInputs = 1, .numberOfOutputs = 1, .outputChannelCounts = ch};
  EMSCRIPTEN_AUDIO_WORKLET_NODE_T node = emscripten_create_wasm_audio_worklet_node(ctx, "p", &opts, AudioProcess, 0);
  
  if (node) {
    workletNodeHandle = node;
    EM_ASM({
      try {
        var ctx = null;
        if (typeof EmAudio !== 'undefined') {
          if (EmAudio[$0]) ctx = EmAudio[$0];
          else if (EmAudio[$1] && EmAudio[$1].context) ctx = EmAudio[$1].context;
        }
        if (ctx) window.audioWorkletNativeContext = ctx;
        window.audioWorkletReady = true;
        window._emscriptenWorkletNode = $1;
        window._emscriptenAudioContextHandle = $0;
      } catch(e) {
        window.audioWorkletReady = true;
        window._emscriptenWorkletNode = $1;
        window._emscriptenAudioContextHandle = $0;
      }
    }, ctx, node);
  }
}

/**
 * Callback invoked when the audio worklet thread is initialized.
 * Registers the audio worklet processor with name "p".
 * 
 * @param ctx Audio context handle
 * @param success 1 if thread was initialized successfully, 0 otherwise
 * @param userData User data pointer (unused)
 */
void AudioThreadInitialized(EMSCRIPTEN_WEBAUDIO_T ctx, int success, void *userData) {
  if (!success) return;
  WebAudioWorkletProcessorCreateOptions opts = {.name = "p"};
  emscripten_create_wasm_audio_worklet_processor_async(ctx, &opts, AudioWorkletProcessorCreated, 0);
}

/**
 * Resumes the audio context if it's not already running.
 * Exposed to JavaScript to allow resuming the context after user interaction.
 */
void ResumeAudioContext() {
  if (audioContext && emscripten_audio_context_state(audioContext) != AUDIO_CONTEXT_STATE_RUNNING) {
    emscripten_resume_audio_context_sync(audioContext);
  }
}

/**
 * Returns the Emscripten audio context handle.
 * Exposed to JavaScript for debugging or advanced use cases.
 * 
 * @return Audio context handle, or 0 if not initialized
 */
int GetAudioContextHandle() {
  return audioContext;
}

/**
 * Sets the VAD aggressiveness mode.
 * Exposed to JavaScript to allow runtime adjustment of VAD sensitivity.
 * 
 * Modes:
 * - 0: Least aggressive (most sensitive to speech)
 * - 1: Low bitrate mode
 * - 2: Aggressive (default)
 * - 3: Most aggressive (least sensitive to speech)
 * 
 * @param mode VAD mode (0-3)
 * @return 0 on success, -1 on error (invalid mode or VAD not initialized)
 */
int SetVADMode(int mode) {
  if (vadInstance == NULL || mode < 0 || mode > 3) return -1;
  return WebRtcVad_set_mode(vadInstance, mode);
}

/**
 * Frees the VAD instance and cleans up resources.
 * Exposed to JavaScript for proper cleanup when shutting down.
 * Safe to call multiple times (idempotent).
 */
void CleanupVAD() {
  if (vadInstance != NULL) {
    WebRtcVad_Free(vadInstance);
    vadInstance = NULL;
  }
}

/**
 * Main entry point. Initializes VAD and audio worklet system.
 * 
 * Initialization sequence:
 * 1. Create and initialize WebRTC VAD instance
 * 2. Set VAD mode to 2 (aggressive)
 * 3. Create Emscripten audio context
 * 4. Expose EmAudio to JavaScript module
 * 5. Start audio worklet thread
 * 
 * @return 0 on success, 1 on error
 */
int main() {
  vadInstance = WebRtcVad_Create();
  if (!vadInstance) return 1;
  
  if (WebRtcVad_Init(vadInstance) != 0) {
    WebRtcVad_Free(vadInstance);
    vadInstance = NULL;
    return 1;
  }
  
  WebRtcVad_set_mode(vadInstance, 2);
  
  audioContext = emscripten_create_audio_context(0);
  if (!audioContext) {
    WebRtcVad_Free(vadInstance);
    vadInstance = NULL;
    return 1;
  }
  
  EM_ASM({
    window._emscriptenAudioContextHandle = $0;
    if (typeof EmAudio !== 'undefined') {
      Module.EmAudio = EmAudio;
    }
  }, audioContext);
  
  emscripten_start_wasm_audio_worklet_thread_async(audioContext, audioThreadStack, sizeof(audioThreadStack), AudioThreadInitialized, 0);
  return 0;
}
