/* eslint-disable @typescript-eslint/no-explicit-any */
import { s } from '../schema';
import { JsonValue } from '../utils';

/**
 * @public
 */
export interface Tool {
  name: string;
  description: string;
  schema: s.HashbrownType | object;
  handler: (input: any, abortSignal: AbortSignal) => Promise<any>;
}

/**
 * @public
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
  argumentsResolved?: JsonValue;
  result?: PromiseSettledResult<any>;
  progress?: number;
  status: 'pending' | 'done';
}

/**
 * @public
 */
export interface AssistantMessage {
  role: 'assistant';
  content?: string;
  contentResolved?: JsonValue;
  toolCallIds: string[];
}

/**
 * @public
 */
export interface UserMessage {
  role: 'user';
  content: JsonValue;
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
export type Message = AssistantMessage | UserMessage | ErrorMessage;
