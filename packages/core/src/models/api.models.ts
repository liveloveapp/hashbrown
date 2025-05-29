/* eslint-disable @typescript-eslint/no-explicit-any */
import { DeepPartial } from '../utils';

export interface Tool {
  name: string;
  description: string;
  parameters: object;
}

export interface ToolCall {
  index: number;
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface AssistantMessage {
  role: 'assistant';
  content?: string;
  toolCalls?: ToolCall[];
}

export interface UserMessage {
  role: 'user';
  content: string;
}

export interface ErrorMessage {
  role: 'error';
  content: string;
}

export interface ToolMessage {
  role: 'tool';
  content: PromiseSettledResult<any>;
  toolCallId: string;
  toolName: string;
}

export type Message =
  | UserMessage
  | ErrorMessage
  | AssistantMessage
  | ToolMessage;

export interface CompletionChunkChoice {
  index: number;
  delta: {
    content?: string | null;
    role?: string | undefined;
    toolCalls?: DeepPartial<ToolCall>[];
  };
  finishReason: string | null;
}

export interface CompletionChunk {
  choices: CompletionChunkChoice[];
}

export type CompletionToolChoiceOption = 'auto' | 'none' | 'required';

export interface CompletionCreateParams {
  model: string;
  system: string;
  messages: Message[];
  responseFormat?: object;
  toolChoice?: CompletionToolChoiceOption;
  tools?: Tool[];
}
