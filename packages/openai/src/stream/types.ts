import type { RunAgentInput } from '@ag-ui/core';
import type OpenAI from 'openai';
import type { OpenAIReasoningOption } from './reasoning';
import type { ActivityCallback } from '@hashbrownai/core';

/**
 * Hashbrown extensions accepted alongside a standard AG-UI run input.
 *
 * @public
 */
export interface OpenAIHashbrownRunAgentInput extends RunAgentInput {
  /**
   * AG-UI's pass-through extension point. Hashbrown's generation semantics
   * travel in `forwardedProps.hashbrown`.
   */
  forwardedProps?: {
    hashbrown?: {
      /** JSON Schema used for native structured output. */
      responseSchema?: object;
      /** Whether the run is expected to produce generative UI output. */
      ui?: boolean;
    };
  } & Record<string, unknown>;
}

/**
 * Options for streaming an AG-UI run from the OpenAI Responses API.
 *
 * @public
 */
export interface OpenAITextStreamOptions {
  /** OpenAI API key. */
  apiKey: string;
  /** Optional OpenAI-compatible API base URL. */
  baseURL?: string;
  /** Model selected by the server for this endpoint. */
  model: string;
  /** Standard AG-UI run input plus optional Hashbrown semantics. */
  input: OpenAIHashbrownRunAgentInput;
  /** Cancels the provider request when the HTTP request is abandoned. */
  signal?: AbortSignal;
  /**
   * Sends AG-UI activity events alongside the model's output. The callback
   * starts after `RUN_STARTED`, its events merge with the model's in arrival
   * order, and the run's terminal event waits until it settles. A thrown
   * error ends the run with `RUN_ERROR`. See {@link ActivityCallback}.
   */
  activities?: ActivityCallback;
  /**
   * Controls the `reasoning` request parameter for reasoning models.
   * See {@link OpenAIReasoningOption}.
   */
  reasoning?: OpenAIReasoningOption;
  /** Customize the Responses request after AG-UI input has been mapped. */
  transformRequestOptions?: (
    options: OpenAI.Responses.ResponseCreateParamsStreaming,
  ) =>
    | OpenAI.Responses.ResponseCreateParamsStreaming
    | Promise<OpenAI.Responses.ResponseCreateParamsStreaming>;
}
