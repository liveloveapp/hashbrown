/* eslint-disable @typescript-eslint/no-explicit-any */
import { s } from '../schema';

export interface Tool {
  name: string;
  description: string;
  schema: s.ObjectType<Record<string, s.HashbrownType>>;
  handler: (input: any, abortSignal: AbortSignal) => Promise<any>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: object;
  result?: PromiseSettledResult<any>;
  progress?: number;
  status: 'pending' | 'done';
}

export interface AssistantMessage {
  role: 'assistant';
  content?: string;
  toolCallIds: string[];
}

export interface UserMessage {
  role: 'user';
  content: string;
}

export type Message = AssistantMessage | UserMessage;
