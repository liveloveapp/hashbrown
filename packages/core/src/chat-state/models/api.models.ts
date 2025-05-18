/* eslint-disable @typescript-eslint/no-explicit-any */
import { DeepPartial } from '../../utils';

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
  tool_calls?: ToolCall[];
}

export interface UserMessage {
  role: 'user';
  content: string;
}

export interface SystemMessage {
  role: 'system';
  content: string;
}

export interface ToolMessage {
  role: 'tool';
  content: PromiseSettledResult<any>;
  tool_call_id: string;
  tool_name: string;
}

export type Message =
  | UserMessage
  | AssistantMessage
  | SystemMessage
  | ToolMessage;

export interface CompletionChunkChoice {
  index: number;
  delta: {
    content?: string | null;
    role?: string;
    tool_calls?: DeepPartial<ToolCall>[];
  };
  finish_reason: string | null;
}

export interface CompletionChunk {
  choices: CompletionChunkChoice[];
}

export type CompletionToolChoiceOption = 'auto' | 'none' | 'required';

export interface CompletionCreateParams {
  model: string;
  messages: Message[];
  temperature?: number;
  max_tokens?: number;
  response_format?: object;
  tool_choice?: CompletionToolChoiceOption;
  tools?: Tool[];
}
