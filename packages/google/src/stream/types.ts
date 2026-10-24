import type { RunAgentInput } from '@ag-ui/core';
import type {
  GenerateContentParameters,
  GoogleSearch,
  ToolCodeExecution,
  UrlContext,
} from '@google/genai';
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

/** Developer API built-ins; Search Suggestions must render unchanged beside the answer. @public */
export interface GoogleDeveloperBuiltInTools {
  /** Google Search; true uses defaults. Availability depends on the model. */
  webSearch?:
    true | Omit<GoogleSearch, 'excludeDomains' | 'blockingConfidence'>;
  /** URL context; true uses defaults. */
  webFetch?: true | UrlContext;
  /** Native code execution; true uses defaults. */
  codeExecution?: true | ToolCodeExecution;
}

/** Vertex built-ins. Native server call circulation is unavailable in this SDK. @public */
export interface GoogleVertexBuiltInTools {
  /** Google Search; true uses defaults. Render required Search Suggestions unchanged. */
  webSearch?: true | Omit<GoogleSearch, 'timeRangeFilter'>;
  /** URL context; true uses defaults. */
  webFetch?: true | UrlContext;
  /** Native code execution; true uses defaults. */
  codeExecution?: true | ToolCodeExecution;
}

/**
 * API-key authentication for the Google Gemini API.
 *
 * @public
 */
export interface GoogleApiKeyAuthOptions {
  /** Optional Gemini Developer API hosted tools. */
  builtInTools?: GoogleDeveloperBuiltInTools;
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
  /** Optional Vertex AI hosted tools. */
  builtInTools?: GoogleVertexBuiltInTools;
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
