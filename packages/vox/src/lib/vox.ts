/**
 * VAD (Voice Activity Detection) library wrapper
 * Provides a clean API for using the VAD audio worklet WASM module
 */

// Type definitions for window extensions
interface WindowWithVAD extends Window {
  audioWorkletReady?: boolean;
  vadModeInitialized?: boolean;
  audioWorkletNativeContext?: AudioContext;
  _emscriptenWorkletNode?: number;
  _emscriptenAudioContextHandle?: number;
  logVADDecisionFromWorklet?: (decision: VADDecision) => void;
}

// Type definitions for the Emscripten module
type CwrapFunction = (...args: unknown[]) => unknown;

interface EmscriptenModule {
  _main(): number;
  cwrap(
    ident: string,
    returnType: string | null,
    argTypes: string[],
  ): CwrapFunction;
  EmAudio?: {
    [key: number]: AudioContext | AudioWorkletNode;
  };
  ready: Promise<EmscriptenModule>;
}

interface VADModuleOptions {
  locateFile?: (path: string) => string;
  mainScriptUrlOrBlob?: string | URL;
}

type VADDecision = 0 | 1; // 0 = no voice, 1 = voice
type VADMode = 0 | 1 | 2 | 3;

export interface VADOptions {
  /**
   * Optional base path for loading worklet/wasm assets.
   * If omitted, defaults to workspace dev path (/dist/packages/vox/assets/).
   */
  basePath?: string;
  /**
   * VAD mode (0-3). Higher values are more aggressive in detecting voice.
   * Default: 2
   */
  mode?: VADMode;
  /**
   * Callback function called when a VAD decision is made
   * @param decision - 1 for voice detected, 0 for no voice
   */
  onDecision?: (decision: VADDecision) => void;
  /**
   * Custom path resolver for WASM assets
   * @param path - The file path to resolve
   * @returns The resolved URL
   */
  locateFile?: (path: string) => string;
  /**
   * Main script URL or blob for the worklet
   */
  mainScriptUrlOrBlob?: string | URL;
  /**
   * Timeout in milliseconds for initialization
   * Default: 10000
   */
  initTimeout?: number;
  /**
   * Polling interval in milliseconds for checking readiness
   * Default: 500
   */
  pollInterval?: number;
}

export interface VADStatus {
  isRunning: boolean;
  isInitialized: boolean;
  mode: VADMode;
  audioContext: AudioContext | null;
}

/**
 * VAD class for managing Voice Activity Detection
 */
export class VAD {
  private module: EmscriptenModule | null = null;
  private audioContext: AudioContext | null = null;
  private microphoneSource: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private isRunning = false;
  private isInitialized = false;
  private mode: VADMode = 2;
  private onDecisionCallback?: (decision: VADDecision) => void;
  private initTimeout = 10000;
  private pollInterval = 500;
  private assetBase: string;
  private checkReadyInterval: ReturnType<typeof setInterval> | null = null;
  private initTimeoutId: ReturnType<typeof setTimeout> | null = null;

  /**
   * Creates a new VAD instance
   * @param options - Configuration options
   */
  constructor(private options: VADOptions = {}) {
    this.mode = options.mode ?? 2;
    this.onDecisionCallback = options.onDecision;
    this.initTimeout = options.initTimeout ?? 10000;
    this.pollInterval = options.pollInterval ?? 500;
    this.assetBase = this.resolveAssetBase(options.basePath);
  }

  /**
   * Initializes the VAD module by loading the WASM module
   * @param moduleLoader - Function that returns the Emscripten module
   * @returns Promise that resolves when the module is ready
   */
  async initialize(
    moduleLoader: (
      options?: VADModuleOptions,
    ) => Promise<EmscriptenModule> | EmscriptenModule,
  ): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    const moduleOptions: VADModuleOptions = {
      // Allow caller override; otherwise let the loader's defaults handle embedded assets.
      locateFile: this.options.locateFile
        ? (path: string) => this.options.locateFile?.(path) ?? path
        : undefined,
      mainScriptUrlOrBlob:
        this.options.mainScriptUrlOrBlob ??
        this.resolveAsset('vad_audio_worklet.single.js'),
    };

    this.module = await moduleLoader(moduleOptions);
    this.isInitialized = true;
  }

  /**
   * Starts VAD recording and processing
   * @returns Promise that resolves when recording has started
   * @throws Error if initialization failed or timeout occurred
   */
  async start(): Promise<void> {
    if (!this.module) {
      throw new Error('VAD not initialized. Call initialize() first.');
    }

    if (this.isRunning) {
      return;
    }

    // Patch AudioWorklet.addModule to handle path resolution
    this.patchAudioWorkletAddModule();

    // Set up VAD decision callback
    this.setupVADCallback();

    // Start the main function
    this.module._main();

    // Wait for worklet to be ready
    return new Promise<void>((resolve, reject) => {
      const win = window as WindowWithVAD;
      const module = this.module;

      if (!module) {
        reject(new Error('Module not available'));
        return;
      }

      this.checkReadyInterval = setInterval(async () => {
        if (!win.audioWorkletReady) {
          return;
        }

        // Set VAD mode if not already set
        if (!win.vadModeInitialized) {
          const setVADMode = module.cwrap('SetVADMode', 'number', [
            'number',
          ]) as (mode: number) => number;
          setVADMode(this.mode);
          win.vadModeInitialized = true;
        }

        // Get audio context
        const contextHandle = win._emscriptenAudioContextHandle;
        const workletNodeHandle = win._emscriptenWorkletNode;

        let audioContext: AudioContext | null = null;

        if (win.audioWorkletNativeContext) {
          audioContext = win.audioWorkletNativeContext;
        } else if (module.EmAudio && contextHandle) {
          const ctx = module.EmAudio[contextHandle];
          if (ctx instanceof AudioContext) {
            audioContext = ctx;
          }
        } else if (module.EmAudio && workletNodeHandle) {
          const node = module.EmAudio[workletNodeHandle];
          if (node instanceof AudioWorkletNode) {
            const baseContext = node.context;
            if (baseContext instanceof AudioContext) {
              audioContext = baseContext;
            }
          }
        }

        this.audioContext = audioContext;

        if (!this.audioContext) {
          return;
        }

        // Resume audio context
        const resumeAudioContext = module.cwrap(
          'ResumeAudioContext',
          null,
          [],
        ) as () => void;
        resumeAudioContext();

        // Connect microphone
        try {
          await this.connectMicrophone();
          this.clearInitTimers();
          this.isRunning = true;
          resolve();
        } catch (error) {
          this.clearInitTimers();
          reject(error);
        }
      }, this.pollInterval);

      // Set timeout
      this.initTimeoutId = setTimeout(() => {
        this.clearInitTimers();
        if (!this.isRunning) {
          reject(new Error('VAD initialization timeout'));
        }
      }, this.initTimeout);
    });
  }

  /**
   * Stops VAD recording and cleans up resources
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.microphoneSource?.disconnect();
    this.workletNode?.disconnect();
    this.audioContext?.close();

    if (this.module?.cwrap) {
      const cleanupVAD = this.module.cwrap('CleanupVAD', null, []);
      cleanupVAD();
    }

    this.microphoneSource = null;
    this.workletNode = null;
    this.audioContext = null;
    this.isRunning = false;
    const win = window as WindowWithVAD;
    win.vadModeInitialized = false;

    this.clearInitTimers();
  }

  /**
   * Sets the VAD mode (0-3)
   * @param mode - VAD mode value
   */
  setMode(mode: VADMode): void {
    if (!this.module?.cwrap) {
      throw new Error('VAD not initialized. Call initialize() first.');
    }

    this.mode = mode;
    const setVADMode = this.module.cwrap('SetVADMode', 'number', ['number']);
    setVADMode(mode);
  }

  /**
   * Gets the current VAD status
   * @returns Current status object
   */
  getStatus(): VADStatus {
    return {
      isRunning: this.isRunning,
      isInitialized: this.isInitialized,
      mode: this.mode,
      audioContext: this.audioContext,
    };
  }

  /**
   * Updates the decision callback
   * @param callback - Function to call when VAD decision is made
   */
  setOnDecision(callback: (decision: VADDecision) => void): void {
    this.onDecisionCallback = callback;
    this.setupVADCallback();
  }

  /**
   * Cleans up all resources and resets the instance
   */
  dispose(): void {
    this.stop();
    this.module = null;
    this.isInitialized = false;
    const win = window as WindowWithVAD;
    delete win.logVADDecisionFromWorklet;
    delete win.audioWorkletReady;
    delete win.vadModeInitialized;
    delete win.audioWorkletNativeContext;
    delete win._emscriptenWorkletNode;
    delete win._emscriptenAudioContextHandle;
  }

  /**
   * Connects the microphone to the audio worklet
   */
  private async connectMicrophone(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });

    if (!this.audioContext) {
      throw new Error('Audio context not available');
    }

    if (!this.module) {
      throw new Error('Module not available');
    }

    this.microphoneSource = this.audioContext.createMediaStreamSource(stream);

    const win = window as WindowWithVAD;
    const nodeHandle = win._emscriptenWorkletNode;

    if (
      !nodeHandle ||
      !this.module.EmAudio ||
      !this.module.EmAudio[nodeHandle]
    ) {
      throw new Error('Worklet node not available');
    }

    const node = this.module.EmAudio[nodeHandle];
    if (!(node instanceof AudioWorkletNode)) {
      throw new Error('Worklet node is not an AudioWorkletNode');
    }

    this.workletNode = node;
    this.microphoneSource.connect(this.workletNode);
    this.workletNode.connect(this.audioContext.destination);
  }

  /**
   * Patches AudioWorklet.addModule to handle path resolution
   */
  private patchAudioWorkletAddModule(): void {
    interface AudioWorkletPrototype extends AudioWorklet {
      __vadPatched?: boolean;
    }

    const prototype = AudioWorklet.prototype as AudioWorkletPrototype;
    if (prototype.__vadPatched) {
      return;
    }

    const assetBase = this.assetBase;
    const origAddModule = AudioWorklet.prototype.addModule;
    AudioWorklet.prototype.addModule = function (url: string | URL) {
      const urlString = typeof url === 'string' ? url : url.toString();
      const fixedUrl =
        urlString.endsWith('.aw.js') || urlString.endsWith('.ww.js')
          ? new URL(urlString, assetBase).href
          : urlString;
      return origAddModule.call(
        this,
        typeof url === 'string' ? new URL(fixedUrl, location.href) : url,
      );
    };
    prototype.__vadPatched = true;
  }

  /**
   * Sets up the VAD decision callback
   */
  private setupVADCallback(): void {
    const win = window as WindowWithVAD;
    win.logVADDecisionFromWorklet = (decision: VADDecision) => {
      if (this.onDecisionCallback) {
        this.onDecisionCallback(decision);
      }
    };
  }

  /**
   * Clears initialization timers
   */
  private clearInitTimers(): void {
    if (this.checkReadyInterval) {
      clearInterval(this.checkReadyInterval);
      this.checkReadyInterval = null;
    }
    if (this.initTimeoutId) {
      clearTimeout(this.initTimeoutId);
      this.initTimeoutId = null;
    }
  }

  /**
   * Resolve a base URL for assets.
   */
  private resolveAssetBase(customBase?: string): string {
    if (customBase) {
      try {
        return new URL(customBase, window.location.href).href;
      } catch {
        return customBase;
      }
    }

    if (typeof window !== 'undefined' && window.location) {
      return new URL('/dist/packages/vox/assets/', window.location.href).href;
    }

    return '/dist/packages/vox/assets/';
  }

  /**
   * Resolve an asset path relative to the base.
   */
  private resolveAsset(path: string): string {
    try {
      return new URL(path, this.assetBase).href;
    } catch {
      return `${this.assetBase}${path}`;
    }
  }
}

/**
 * Creates a new VAD instance
 * @param options - Configuration options
 * @returns New VAD instance
 */
export function createVAD(options?: VADOptions): VAD {
  return new VAD(options);
}
