#include <emscripten/webaudio.h>
#include <emscripten/em_asm.h>
#include <stdint.h>

uint8_t audioThreadStack[4096];
EMSCRIPTEN_WEBAUDIO_T audioContext;

void OnMessageFromAudioThread(int value) {
  EM_ASM({ window.logIntegerFromWorklet($0); }, value);
}

int AudioProcess(int numInputs, const AudioSampleFrame *inputs,
                 int numOutputs, AudioSampleFrame *outputs,
                 int numParams, const AudioParamFrame *params,
                 void *userData) {
  static int sent = 0;
  if (!sent) {
    emscripten_audio_worklet_post_function_vi(0, OnMessageFromAudioThread, 42);
    sent = 1;
  }
  return 1;
}

void AudioWorkletNodeCreated(EMSCRIPTEN_WEBAUDIO_T ctx, EMSCRIPTEN_AUDIO_WORKLET_NODE_T node, int success, void *userData) {
  (void)ctx; (void)node; (void)success; (void)userData;
}

void AudioWorkletProcessorCreated(EMSCRIPTEN_WEBAUDIO_T ctx, int success, void *userData) {
  if (!success) return;
  int ch[1] = {1};
  EmscriptenAudioWorkletNodeCreateOptions opts = {.numberOfInputs = 0, .numberOfOutputs = 1, .outputChannelCounts = ch};
  emscripten_create_wasm_audio_worklet_node(ctx, "p", &opts, AudioProcess, 0);
}

void AudioThreadInitialized(EMSCRIPTEN_WEBAUDIO_T ctx, int success, void *userData) {
  if (!success) return;
  WebAudioWorkletProcessorCreateOptions opts = {.name = "p"};
  emscripten_create_wasm_audio_worklet_processor_async(ctx, &opts, AudioWorkletProcessorCreated, 0);
}

void ResumeAudioContext() {
  if (audioContext && emscripten_audio_context_state(audioContext) != AUDIO_CONTEXT_STATE_RUNNING) {
    emscripten_resume_audio_context_sync(audioContext);
  }
}

int main() {
  audioContext = emscripten_create_audio_context(0);
  if (!audioContext) return 1;
  emscripten_start_wasm_audio_worklet_thread_async(audioContext, audioThreadStack, sizeof(audioThreadStack), AudioThreadInitialized, 0);
  return 0;
}
