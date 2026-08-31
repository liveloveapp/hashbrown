/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Metadata, ReasoningMessage } from '@ag-ui/core';
import { s } from '../schema';
import { JsonValue } from '../utils';

/**
 * Internal provider-neutral representation of assistant reasoning.
 *
 * @internal
 */
export type ɵInternalReasoning =
  | {
      readonly kind: 'details';
      readonly details: readonly Readonly<ReasoningMessage>[];
    }
  | {
      readonly kind: 'display';
      readonly text: string;
    };

/**
 * @public
 */
export interface Tool {
  name: string;
  description: string;
  schema: s.SchemaInput;
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
  contentResolved?: JsonValue;
  toolCallIds: string[];

  /**
   * Opaque provider continuation data preserved across AG-UI runs.
   * Hashbrown does not inspect or display this value.
   */
  encryptedValue?: string;

  /** Provider metadata preserved across AG-UI runs. */
  metadata?: Metadata;

  reasoning?: ɵInternalReasoning;
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
