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
 * Provider-run (built-in) tools to turn on for a run. Each key is the
 * camelCase form of the `builtin` value its calls report, so the same key
 * means the same capability on every Hashbrown provider adapter.
 *
 * @public
 */
export interface OpenAIBuiltInTools {
  /**
   * Turns on OpenAI's `web_search` tool. Pass `true` for the provider
   * defaults, or OpenAI's own web search configuration (for example
   * `search_context_size`, `user_location` or `filters`), which is sent
   * unchanged.
   *
   * Each search streams as a `web_search` tool call that runs on the
   * provider, never in the app, with its queries, sources and a label. The
   * answer's `url_citation` annotations become citations that point at those
   * sources. Sources need this option: it also requests
   * `web_search_call.action.sources`. A `web_search` tool added through
   * `transformRequestOptions` instead still streams as a provider tool call,
   * but without sources.
   *
   * OpenAI requires inline citations to be clearly visible and clickable in
   * any UI that shows the answer.
   */
  webSearch?: true | Omit<OpenAI.Responses.WebSearchTool, 'type'>;
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
  /**
   * Provider-run tools to turn on, such as web search.
   * See {@link OpenAIBuiltInTools}.
   */
  builtInTools?: OpenAIBuiltInTools;
  /** Customize the Responses request after AG-UI input has been mapped. */
  transformRequestOptions?: (
    options: OpenAI.Responses.ResponseCreateParamsStreaming,
  ) =>
    | OpenAI.Responses.ResponseCreateParamsStreaming
    | Promise<OpenAI.Responses.ResponseCreateParamsStreaming>;
}
