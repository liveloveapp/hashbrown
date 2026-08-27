import type { RunAgentInput } from '@ag-ui/core';
import type Anthropic from '@anthropic-ai/sdk';

/**
 * Hashbrown extensions accepted alongside a standard AG-UI run input.
 *
 * @public
 */
export interface AnthropicHashbrownRunAgentInput extends RunAgentInput {
  hashbrown?: {
    responseSchema?: object;
    ui?: boolean;
  };
}

/**
 * Options for streaming an AG-UI run from Anthropic.
 *
 * @public
 */
export interface AnthropicTextStreamOptions {
  /** Anthropic API key. */
  apiKey: string;
  /** Optional Anthropic-compatible API base URL. */
  baseURL?: string;
  /** Model selected by the server for this endpoint. */
  model: string;
  /** Standard AG-UI run input plus optional Hashbrown semantics. */
  input: AnthropicHashbrownRunAgentInput;
  /** Cancels the provider request when the HTTP request is abandoned. */
  signal?: AbortSignal;
  /** Customize the Anthropic request after AG-UI input has been mapped. */
  transformRequestOptions?: (
    options: Anthropic.Messages.MessageCreateParamsStreaming,
  ) =>
    | Anthropic.Messages.MessageCreateParamsStreaming
    | Promise<Anthropic.Messages.MessageCreateParamsStreaming>;
}
