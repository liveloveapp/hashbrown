import type { RunAgentInput } from '@ag-ui/core';
import type {
  BedrockRuntimeClient,
  BedrockRuntimeClientConfig,
  ConverseStreamCommandInput,
} from '@aws-sdk/client-bedrock-runtime';

/**
 * Hashbrown extensions accepted alongside a standard AG-UI run input.
 *
 * @public
 */
export interface BedrockHashbrownRunAgentInput extends RunAgentInput {
  /** Hashbrown semantics layered onto the standard AG-UI run input. */
  hashbrown?: {
    /** JSON Schema used for Bedrock native structured output. */
    responseSchema?: object;
    /** Whether the run is expected to produce generative UI output. */
    ui?: boolean;
  };
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
  /** Customize the Bedrock request after AG-UI input has been mapped. */
  transformRequestOptions?: (
    options: ConverseStreamCommandInput,
  ) => ConverseStreamCommandInput | Promise<ConverseStreamCommandInput>;
};
