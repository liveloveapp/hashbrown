/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Metadata, ReasoningMessage } from '@ag-ui/core';
import { DeepPartial } from '../utils';

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

  /**
   * Opaque provider continuation data preserved across AG-UI runs.
   * Hashbrown does not inspect or display this value.
   */
  encryptedValue?: string;

  /** Provider metadata preserved across AG-UI runs. */
  metadata?: Metadata;
}

/**
 * @public
 */
export interface AssistantMessage {
  role: 'assistant';
  content?: string;
  toolCalls?: ToolCall[];

  /**
   * Opaque provider continuation data preserved across AG-UI runs.
   * Hashbrown does not inspect or display this value.
   */
  encryptedValue?: string;

  /** Provider metadata preserved across AG-UI runs. */
  metadata?: Metadata;

  /**
   * Human-readable reasoning. When `reasoningDetails` is present, this value
   * is derived from the ordered records' nonempty content.
   */
  reasoning?: string;

  /**
   * Ordered AG-UI reasoning records, including opaque continuation data such
   * as encrypted values, subagent run IDs, and metadata. When present, these
   * records take precedence over `reasoning`.
   */
  readonly reasoningDetails?: readonly Readonly<ReasoningMessage>[];
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
