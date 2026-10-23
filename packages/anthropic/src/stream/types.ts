import type { RunAgentInput } from '@ag-ui/core';
import type Anthropic from '@anthropic-ai/sdk';
import type { ActivityCallback } from '@hashbrownai/core';

/**
 * Hashbrown extensions accepted alongside a standard AG-UI run input.
 *
 * @public
 */
export interface AnthropicHashbrownRunAgentInput extends RunAgentInput {
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

/** Removes the adapter-owned name from each SDK tool version. */
type ToolConfiguration<T> = T extends unknown ? Omit<T, 'name'> : never;

/**
 * Anthropic server tools enabled alongside application functions.
 *
 * `true` selects web search 20250305, web fetch 20250910 (with citations),
 * or code execution 20250825. Object settings retain their SDK version and options.
 * Model support varies by version. Applications must display required source
 * attribution. The request transform can further customize these tools.
 * @public
 */
export interface AnthropicBuiltInTools {
  /** Enables web search with the pinned default or an explicit SDK version. */
  webSearch?:
    | true
    | ToolConfiguration<
        Extract<Anthropic.Messages.ToolUnion, { name: 'web_search' }>
      >;
  /** Enables web fetch; the default enables citations. */
  webFetch?:
    | true
    | ToolConfiguration<
        Extract<Anthropic.Messages.ToolUnion, { name: 'web_fetch' }>
      >;
  /** Enables code execution with the pinned default or an explicit SDK version. */
  codeExecution?:
    | true
    | ToolConfiguration<
        Extract<Anthropic.Messages.ToolUnion, { name: 'code_execution' }>
      >;
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
  /** Provider-managed tools; see {@link AnthropicBuiltInTools} for defaults. */
  builtInTools?: AnthropicBuiltInTools;
  /** Standard AG-UI run input plus optional Hashbrown semantics. */
  input: AnthropicHashbrownRunAgentInput;
  /** Cancels the provider request when the HTTP request is abandoned. */
  signal?: AbortSignal;
  /**
   * Sends AG-UI activity events alongside the model's output. The callback
   * starts after `RUN_STARTED`, its events merge with the model's in arrival
   * order, and the run's terminal event waits until it settles. A thrown
   * error ends the run with `RUN_ERROR`. See {@link ActivityCallback}.
   */
  activities?: ActivityCallback;
  /** Customize the Anthropic request after AG-UI input has been mapped. */
  transformRequestOptions?: (
    options: Anthropic.Messages.MessageCreateParamsStreaming,
  ) =>
    | Anthropic.Messages.MessageCreateParamsStreaming
    | Promise<Anthropic.Messages.MessageCreateParamsStreaming>;
}
