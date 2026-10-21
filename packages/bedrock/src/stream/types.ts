import type { RunAgentInput } from '@ag-ui/core';
import type {
  BedrockRuntimeClient,
  BedrockRuntimeClientConfig,
  ConverseStreamCommandInput,
} from '@aws-sdk/client-bedrock-runtime';
import type { ActivityCallback } from '@hashbrownai/core';

/**
 * Hashbrown extensions accepted alongside a standard AG-UI run input.
 *
 * @public
 */
export interface BedrockHashbrownRunAgentInput extends RunAgentInput {
  /** Hashbrown semantics layered onto the standard AG-UI run input. */
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
 * Options for streaming an AG-UI run from Amazon Bedrock.
 *
 * @public
 */
export type BedrockTextStreamOptions = (
  | {
      /** Reusable official Bedrock Runtime SDK client. */
      client: BedrockRuntimeClient;
      /** Excludes SDK client configuration when a client is supplied. */
      clientOptions?: never;
    }
  | {
      /** Excludes a supplied client when SDK client configuration is used. */
      client?: never;
      /** Official Bedrock Runtime SDK client configuration. */
      clientOptions?: BedrockRuntimeClientConfig;
    }
) & {
  /** Model or inference profile selected by the server for this endpoint. */
  model: string;
  /** Standard AG-UI run input plus optional Hashbrown semantics. */
  input: BedrockHashbrownRunAgentInput;
  /** Cancels the provider request when the HTTP request is abandoned. */
  signal?: AbortSignal;
  /**
   * Sends AG-UI activity events alongside the model's output. The callback
   * starts after `RUN_STARTED`, its events merge with the model's in arrival
   * order, and the run's terminal event waits until it settles. A thrown
   * error ends the run with `RUN_ERROR`. See {@link ActivityCallback}.
   */
  activities?: ActivityCallback;
  /** Customize the Bedrock request after AG-UI input has been mapped. */
  transformRequestOptions?: (
    options: ConverseStreamCommandInput,
  ) => ConverseStreamCommandInput | Promise<ConverseStreamCommandInput>;
};
