import type { RunAgentInput } from '@ag-ui/core';
import type { ChatRequest, Ollama } from 'ollama';

/**
 * Hashbrown extensions accepted alongside a standard AG-UI run input.
 *
 * @public
 */
export interface OllamaHashbrownRunAgentInput extends RunAgentInput {
  /** Hashbrown semantics layered onto the standard AG-UI run input. */
  hashbrown?: {
    /** JSON Schema used for Ollama native structured output. */
    responseSchema?: object;
    /** Whether the run is expected to produce generative UI output. */
    ui?: boolean;
  };
}

/**
 * Options for streaming an AG-UI run from Ollama.
 *
 * @public
 */
export interface OllamaTextStreamOptions {
  /** Preconfigured Ollama SDK client for advanced transport settings. */
  client?: Ollama;
  /** Ollama host URL used when creating a client for this run. */
  host?: string;
  /** Model selected by the server for this endpoint. */
  model: string;
  /** Standard AG-UI run input plus optional Hashbrown semantics. */
  input: OllamaHashbrownRunAgentInput;
  /** Cancels the provider request when the HTTP request is abandoned. */
  signal?: AbortSignal;
  /** Customize the Ollama request after AG-UI input has been mapped. */
  transformRequestOptions?: (
    options: ChatRequest & { stream: true },
  ) =>
    (ChatRequest & { stream: true }) | Promise<ChatRequest & { stream: true }>;
}
