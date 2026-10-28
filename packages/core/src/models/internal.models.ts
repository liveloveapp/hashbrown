/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Metadata, ReasoningMessage } from '@ag-ui/core';
import { s } from '../schema';
import { JsonValue } from '../utils';
import type { ActivityLinks } from './view.models';

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
  /**
   * The subagent invocation that produced this message or requested this call.
   * Calls inherit their enclosing assistant's owner when omitted.
   */
  readonly subagentRunId?: string;
  /**
   * The subagent invocation that produced the result. An absent owner means
   * the parent when a result exists; a pending call has no result provenance yet.
   */
  readonly resultSubagentRunId?: string;

  id: string;
  name: string;
  arguments: string;
  argumentsResolved?: JsonValue;
  /** Set once the stream has finished delivering the arguments (TOOL_CALL_END). */
  argumentsComplete?: boolean;
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
  /**
   * The subagent invocation that produced this message or requested this call.
   * Calls inherit their enclosing assistant's owner when omitted.
   */
  readonly subagentRunId?: string;

  /** Opaque canonical AG-UI identifier used for projection reconciliation. */
  readonly id?: string;
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
  /**
   * The subagent invocation that produced this message or requested this call.
   * Calls inherit their enclosing assistant's owner when omitted.
   */
  readonly subagentRunId?: string;

  /** Opaque canonical AG-UI identifier used for projection reconciliation. */
  readonly id?: string;
  role: 'user';
  content: JsonValue;
}

/**
 * @public
 */
export interface ErrorMessage {
  /** Opaque canonical AG-UI identifier used for projection reconciliation. */
  readonly id?: string;
  role: 'error';
  content: string;
}

/**
 * An AG-UI activity message in Hashbrown's internal projection, with the
 * links recorded on its canonical record.
 *
 * @public
 */
export interface ActivityMessage {
  /** The canonical AG-UI activity message id. */
  readonly id: string;
  role: 'activity';
  activityType: string;
  /** Deep-frozen payload shared with canonical history. */
  content: Readonly<Record<string, unknown>>;
  metadata?: Metadata;
  links: ActivityLinks;
}

/**
 * @public
 */
export type Message =
  AssistantMessage | UserMessage | ErrorMessage | ActivityMessage;
