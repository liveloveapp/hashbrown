/** Options accepted by the embedded VAD audio worklet module factory. */
export interface EmbeddedVADModuleOptions {
  locateFile?: (path: string, scriptDirectory?: string) => string;
  mainScriptUrlOrBlob?: string | URL;
}

/** A callable JavaScript wrapper around an exported WebAssembly function. */
export type EmbeddedVADCwrapFunction = (...args: unknown[]) => unknown;

/** The VAD module surface consumed by the Vox runtime. */
export interface EmbeddedVADModule {
  _main(): number;
  cwrap(
    ident: string,
    returnType: string | null,
    argTypes: string[],
  ): EmbeddedVADCwrapFunction;
  EmAudio?: Record<number, AudioContext | AudioWorkletNode>;
  ready: Promise<EmbeddedVADModule>;
}

/** Creates the embedded VAD audio worklet module. */
export type EmbeddedVADModuleFactory = (
  options?: EmbeddedVADModuleOptions,
) => Promise<EmbeddedVADModule>;

declare const createEmbeddedModule: EmbeddedVADModuleFactory;

export default createEmbeddedModule;
