import type { RunAgentInput } from '@ag-ui/core';
import type { AzureClientOptions } from 'openai/azure';
import type OpenAI from 'openai';

/**
 * Hashbrown extensions accepted alongside a standard AG-UI run input.
 *
 * @public
 */
export interface AzureHashbrownRunAgentInput extends RunAgentInput {
  /** Hashbrown semantics layered onto the standard AG-UI run input. */
  hashbrown?: {
    /** JSON Schema used for Azure OpenAI native structured output. */
    responseSchema?: object;
    /** Whether the run is expected to produce generative UI output. */
    ui?: boolean;
  };
}

/**
 * Options for streaming an AG-UI run from Azure OpenAI.
 *
 * @public
 */
export interface AzureTextStreamOptions {
  /** Official Azure OpenAI SDK client configuration. */
  clientOptions: AzureClientOptions;
  /** Model selected by the server for this endpoint. */
  model: string;
  /** Standard AG-UI run input plus optional Hashbrown semantics. */
  input: AzureHashbrownRunAgentInput;
  /** Cancels the provider request when the HTTP request is abandoned. */
  signal?: AbortSignal;
  /** Customize the Azure OpenAI request after AG-UI input is mapped. */
  transformRequestOptions?: (
    options: OpenAI.Chat.ChatCompletionCreateParamsStreaming,
  ) =>
    | OpenAI.Chat.ChatCompletionCreateParamsStreaming
    | Promise<OpenAI.Chat.ChatCompletionCreateParamsStreaming>;
}
