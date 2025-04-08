import { JSONSchema } from 'openai/lib/jsonschema';
import OpenAI from 'openai';
import { Signal } from '@angular/core';
// Tool function definition
export type Tool<
  Name extends string = string,
  Schema extends JSONSchema = JSONSchema
> = {
  name: Name;
  description: string;
  schema: Schema;
};

// Role types for messages
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

// System message
export interface SystemMessage {
  role: 'system';
  content: string;
}

// User message
export interface UserMessage {
  role: 'user';
  content: string;
}

// Assistant message with optional tool calls
export interface AssistantMessage {
  role: 'assistant';
  content: string | null;
  tool_calls?: {
    index: number;
    id: string;
    type: string;
    function: {
      name: string;
      arguments: string;
    };
  }[];
}

// Tool response message
export interface ToolMessage {
  role: 'tool';
  content: string;
  tool_call_id: string;
}

// Union type for all message types
export type ChatMessage =
  | SystemMessage
  | UserMessage
  | AssistantMessage
  | ToolMessage;

// Request configuration for chat completion with tools
export type ChatCompletionWithToolsRequest = {
  model: string;
  messages: ChatMessage[];
  tools?: OpenAI.Chat.Completions.ChatCompletionTool[];
  tool_choice?:
    | 'auto'
    | 'none'
    | {
        type: 'function';
        function: {
          name: string;
        };
      };
  temperature?: number;
  max_tokens?: number;
  response_format?: JSONSchema;
};

export type ChatCompletionWithToolsResponse = {
  id: string;
  object: string;
  created: number;
  choices: {
    message: ChatMessage;
    finish_reason: string;
    index: number;
  }[];
};

// Streaming response type for chat completion
export type ChatCompletionChunk = {
  id: string;
  object: string;
  created: number;
  model: string;
  service_tier: 'default' | 'scale' | null | undefined;
  system_fingerprint?: string;
  choices: {
    index: number;
    delta: {
      content?: string | null;
      role?: string;
      tool_calls?: {
        index: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }[];
    };
    logprobs: null;
    finish_reason: string | null;
  }[];
};

export type SignalLike<T> = T | Signal<T>;

export type Json =
  | string
  | undefined
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json }
  | { [key: number]: Json };
