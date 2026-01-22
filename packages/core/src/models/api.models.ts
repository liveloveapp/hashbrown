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
  | UserMessage
  | ErrorMessage
  | AssistantMessage
  | ToolMessage;

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
 * @public
 */
export interface CompletionCreateParams {
  operation: 'load-thread' | 'generate';
  model: ModelInput;
  system: string;
  messages: Message[];
  responseFormat?: object;
  toolChoice?: CompletionToolChoiceOption;
  tools?: Tool[];
  threadId?: string;
}
