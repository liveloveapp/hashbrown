import type { RunAgentInput } from '@ag-ui/core';
import type { GenerateContentParameters } from '@google/genai';
import type { ActivityCallback } from '@hashbrownai/core';

/**
 * Hashbrown extensions accepted alongside a standard AG-UI run input.
 *
 * @public
 */
export interface GoogleHashbrownRunAgentInput extends RunAgentInput {
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
 * API-key authentication for the Google Gemini API.
 *
 * @public
 */
export interface GoogleApiKeyAuthOptions {
  /** Gemini Developer API key. */
  apiKey: string;
  /** Excludes Vertex AI authentication. */
  vertexai?: undefined;
  /** Excludes a Vertex AI project. */
  project?: undefined;
  /** Excludes a Vertex AI location. */
  location?: undefined;
}

/**
 * Google Cloud authentication for Vertex AI.
 *
 * @public
 */
export interface GoogleVertexAIAuthOptions {
  /** Enables Vertex AI authentication. */
  vertexai: true;
  /** Google Cloud project containing the Vertex AI model. */
  project: string;
  /** Google Cloud region used for Vertex AI requests. */
  location: string;
  /** Excludes Gemini Developer API key authentication. */
  apiKey?: undefined;
}

/**
 * Options for streaming an AG-UI run from Google.
 *
 * @public
 */
export type GoogleTextStreamOptions = (
  GoogleApiKeyAuthOptions | GoogleVertexAIAuthOptions
) & {
  /** Model selected by the server for this endpoint. */
  model: string;
  /** Standard AG-UI run input plus optional Hashbrown semantics. */
  input: GoogleHashbrownRunAgentInput;
  /** Cancels the provider request when the HTTP request is abandoned. */
  signal?: AbortSignal;
  /**
   * Sends AG-UI activity events alongside the model's output. The callback
   * starts after `RUN_STARTED`, its events merge with the model's in arrival
   * order, and the run's terminal event waits until it settles. A thrown
   * error ends the run with `RUN_ERROR`. See {@link ActivityCallback}.
   */
  activities?: ActivityCallback;
  /** Customize the Google request after AG-UI input has been mapped. */
  transformRequestOptions?: (
    options: GenerateContentParameters,
  ) => GenerateContentParameters | Promise<GenerateContentParameters>;
};
