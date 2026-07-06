/* eslint-disable @typescript-eslint/no-explicit-any */
import { DeepPartial } from '../utils';
import { ModelInput } from '../transport';

/**
 * @public
 */
export interface Tool {
  name: string;
  description: string;
  parameters: object;
}

/**
 * @public
 */
export interface ToolCall {
  index: number;
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
  metadata?: Record<string, unknown>;
}

/**
 * @public
 */
export interface AssistantMessage {
  role: 'assistant';
  content?: string;
  toolCalls?: ToolCall[];
}

/**
 * @public
 */
export interface UserMessage {
  role: 'user';
  content: string;
}

/**
 * @public
 */
export interface ErrorMessage {
  role: 'error';
  content: string;
}

/**
 * @public
 */
export interface ToolMessage {
  role: 'tool';
  content: PromiseSettledResult<any>;
  toolCallId: string;
  toolName: string;
}

/**
 * @public
 */
export type Message =
  UserMessage | ErrorMessage | AssistantMessage | ToolMessage;

/**
 * @public
 */
export interface CompletionChunkChoice {
  index: number;
  delta: {
    content?: string | null;
    role?: string | undefined;
    toolCalls?: DeepPartial<ToolCall>[];
  };
  finishReason: string | null;
}

/**
 * @public
 */
export interface CompletionChunk {
  choices: CompletionChunkChoice[];
}

/**
 * @public
 */
export type CompletionToolChoiceOption = 'auto' | 'none' | 'required';

/**
 * Controls how structured resource schemas are enforced by the provider.
 *
 * @public
 */
export type StructuredOutputMode = 'strict' | 'json' | 'tool';

/**
 * Options for structured output generation.
 *
 * @public
 */
export interface StructuredOutputOptions {
  /**
   * The structured output mode to use.
   *
   * - `strict` sends the schema to providers that support schema-constrained output.
   * - `json` asks the provider for JSON without schema-constrained decoding.
   * - `tool` uses the reserved output tool for emulated structured output.
   */
  mode?: StructuredOutputMode;
}

/**
 * Provider-facing response format mode.
 *
 * @public
 */
export type ResponseFormatMode = 'schema' | 'json';

/**
 * @public
 */
export interface CompletionCreateParams {
  operation: 'load-thread' | 'generate';
  model: ModelInput;
  system: string;
  messages: Message[];
  responseFormat?: object;
  responseFormatMode?: ResponseFormatMode;
  toolChoice?: CompletionToolChoiceOption;
  tools?: Tool[];
  threadId?: string;
}
