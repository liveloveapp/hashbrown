/**
 * JavaScript wrapper for WebRTC VAD WebAssembly module
 *
 * This provides a clean JavaScript API for the VAD functionality
 */

class WebRTCVAD {
  /**
   * Build information for this VAD module
   * This will be populated with the actual WebRTC commit SHA during build
   */
  static BUILD_INFO = {
    webrtc_commit_sha: 'edce0aad07b07c11fc30b2a4444caaa4f3a04b51',
    build_date: '2025-10-18T16:48:45Z',
    version: '1.0.0',
  };

  constructor() {
    this.vad = null;
    this.module = null;
  }

  /**
   * Get build information
   * @returns {Object} Build information including WebRTC commit SHA
   */
  static getBuildInfo() {
    return { ...WebRTCVAD.BUILD_INFO };
  }

  /**
   * Initialize the VAD module
   * @param {Object} wasmModule - The loaded WASM module
   */
  async init(wasmModule) {
    this.module = wasmModule;

    // Create VAD instance
    this.vad = this.module.ccall('WebRtcVad_Create', 'number', [], []);
    if (!this.vad) {
      throw new Error('Failed to create VAD instance');
    }

    // Initialize VAD
    const initResult = this.module.ccall(
      'WebRtcVad_Init',
      'number',
      ['number'],
      [this.vad],
    );
    if (initResult !== 0) {
      throw new Error(`Failed to initialize VAD: ${initResult}`);
    }

    return this;
  }

  /**
   * Set the VAD aggressiveness mode
   * @param {number} mode - Aggressiveness mode (0-3)
   *  0: Least aggressive (more sensitive to speech)
   *  1: Low bitrate mode
   *  2: Aggressive
   *  3: Most aggressive (less sensitive to speech)
   */
  setMode(mode) {
    if (!this.vad) {
      throw new Error('VAD not initialized');
    }
    if (mode < 0 || mode > 3) {
      throw new Error('Mode must be between 0 and 3');
    }

    const result = this.module.ccall(
      'WebRtcVad_set_mode',
      'number',
      ['number', 'number'],
      [this.vad, mode],
    );
    if (result !== 0) {
      throw new Error(`Failed to set VAD mode: ${result}`);
    }
  }

  /**
   * Process audio frame and get VAD decision
   * @param {Int16Array} audioFrame - Audio samples (16-bit PCM)
   * @param {number} sampleRate - Sample rate in Hz (8000, 16000, or 32000)
   * @returns {number} VAD decision: 1 (active voice), 0 (non-active), -1 (error)
   */
  process(audioFrame, sampleRate) {
    if (!this.vad) {
      throw new Error('VAD not initialized');
    }

    // Validate sample rate
    if (![8000, 16000, 32000].includes(sampleRate)) {
      throw new Error('Sample rate must be 8000, 16000, or 32000 Hz');
    }

    // Validate frame length
    const expectedLength = sampleRate / 100; // 10ms frames
    if (audioFrame.length !== expectedLength) {
      throw new Error(
        `Frame length must be ${expectedLength} samples for ${sampleRate}Hz`,
      );
    }

    // Allocate memory for audio data
    const audioPtr = this.module._malloc(audioFrame.length * 2); // 2 bytes per sample

    // Copy audio data to WASM memory
    this.module.HEAP16.set(audioFrame, audioPtr / 2);

    // Process audio
    const result = this.module.ccall(
      'WebRtcVad_Process',
      'number',
      ['number', 'number', 'number', 'number'],
      [this.vad, sampleRate, audioPtr, audioFrame.length],
    );

    // Free allocated memory
    this.module._free(audioPtr);

    return result;
  }

  /**
   * Check if a sample rate and frame length combination is valid
   * @param {number} sampleRate - Sample rate in Hz
   * @param {number} frameLength - Frame length in samples
   * @returns {boolean} True if valid combination
   */
  isValidRateAndFrameLength(sampleRate, frameLength) {
    const result = this.module.ccall(
      'WebRtcVad_ValidRateAndFrameLength',
      'number',
      ['number', 'number'],
      [sampleRate, frameLength],
    );
    return result === 0;
  }

  /**
   * Clean up VAD instance
   */
  destroy() {
    if (this.vad) {
      this.module.ccall('WebRtcVad_Free', null, ['number'], [this.vad]);
      this.vad = null;
    }
  }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WebRTCVAD;
} else if (typeof define === 'function' && define.amd) {
  define([], function () {
    return WebRTCVAD;
  });
} else {
  window.WebRTCVAD = WebRTCVAD;
}
