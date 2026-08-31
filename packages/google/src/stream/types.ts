import type { RunAgentInput } from '@ag-ui/core';
import type { GenerateContentParameters } from '@google/genai';

/**
 * Hashbrown extensions accepted alongside a standard AG-UI run input.
 *
 * @public
 */
export interface GoogleHashbrownRunAgentInput extends RunAgentInput {
  /** Hashbrown semantics layered onto the standard AG-UI run input. */
  hashbrown?: {
    /** JSON Schema used for Google's native structured output. */
    responseSchema?: object;
    /** Whether the run is expected to produce generative UI output. */
    ui?: boolean;
  };
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
  /** Customize the Google request after AG-UI input has been mapped. */
  transformRequestOptions?: (
    options: GenerateContentParameters,
  ) => GenerateContentParameters | Promise<GenerateContentParameters>;
};
