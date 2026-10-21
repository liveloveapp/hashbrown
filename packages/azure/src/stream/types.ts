import type { RunAgentInput } from '@ag-ui/core';
import type { AzureClientOptions } from 'openai/azure';
import type OpenAI from 'openai';
import type { AzureReasoningOption } from './reasoning';
import type { ActivityCallback } from '@hashbrownai/core';

/**
 * Hashbrown extensions accepted alongside a standard AG-UI run input.
 *
 * @public
 */
export interface AzureHashbrownRunAgentInput extends RunAgentInput {
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
 * Options for streaming an AG-UI run from the Azure OpenAI Responses API.
 *
 * @public
 */
export interface AzureTextStreamOptions {
  /**
   * Official Azure OpenAI SDK client configuration. Set `endpoint` and a
   * Responses-capable `apiVersion`; `deployment` is not supported because the
   * Responses API selects the deployment through `model`.
   */
  clientOptions: AzureClientOptions;
  /** Azure deployment name, sent as the Responses request `model`. */
  model: string;
  /** Standard AG-UI run input plus optional Hashbrown semantics. */
  input: AzureHashbrownRunAgentInput;
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
   * See {@link AzureReasoningOption}.
   */
  reasoning?: AzureReasoningOption;
  /** Customize the Responses request after AG-UI input has been mapped. */
  transformRequestOptions?: (
    options: OpenAI.Responses.ResponseCreateParamsStreaming,
  ) =>
    | OpenAI.Responses.ResponseCreateParamsStreaming
    | Promise<OpenAI.Responses.ResponseCreateParamsStreaming>;
}
