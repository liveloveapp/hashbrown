/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Metadata, ReasoningMessage } from '@ag-ui/core';
import { s } from '../schema';
import { JsonValue, Prettify } from '../utils';

/**
 * @public
 */
export type Middleware = (
  fetchInit: RequestInit,
) => RequestInit | Promise<RequestInit>;

/**
 * @public
 */
export type Tool<Name, Args, Result> = {
  name: Name;
  description: string;
  schema: s.SchemaInput;
  handler: (input: Args, abortSignal: AbortSignal) => Promise<Result>;
};

/**
 * @public
 */
export type AnyTool = Tool<string, any, any>;

/**
 * A message the user sent.
 *
 * @public
 */
export type UserMessage = {
  /** The canonical AG-UI message id. Stable for the life of the message. */
  readonly id: string;
  role: 'user';
  content: JsonValue;
};

/**
 * @public
 */
export type ToolCall<ToolUnion extends AnyTool> = Prettify<
  ToolUnion extends Tool<infer Name, infer Args, infer Result>
    ? | {
          role: 'tool';
          status: 'done';
          name: Name;
          args: Args;
          result: PromiseSettledResult<Result>;
          toolCallId: string;

          /**
           * Opaque provider continuation data preserved across AG-UI runs.
           * Hashbrown does not inspect or display this value.
           */
          encryptedValue?: string;

          /** Provider metadata preserved across AG-UI runs. */
          metadata?: Metadata;
        }
      | {
          role: 'tool';
          status: 'pending';
          name: Name;
          args: Args;
          toolCallId: string;
          progress?: number;

          /**
           * Opaque provider continuation data preserved across AG-UI runs.
           * Hashbrown does not inspect or display this value.
           */
          encryptedValue?: string;

          /** Provider metadata preserved across AG-UI runs. */
          metadata?: Metadata;
        }
    : never
>;

/**
 * @public
 */
export type AnyToolCall = ToolCall<AnyTool>;

/**
 * A tool call the agent server executes itself, surfaced for display only.
 *
 * Hashbrown never runs these: the client has no tool of that name. The
 * arguments resolve as they stream, so a renderer can paint from them before
 * the call finishes. `status` is `inProgress` while argument deltas arrive,
 * `executing` once the arguments are complete and no result has arrived, and
 * `complete` once the server reports the result.
 *
 * @public
 */
export type ServerToolCall = {
  toolCallId: string;
  name: string;
  status: 'inProgress' | 'executing' | 'complete';
  /** The arguments resolved so far, or `null` before any JSON has parsed. */
  args: JsonValue | null;
  /** The server's result, present once `status` is `complete`. */
  result?: PromiseSettledResult<unknown>;
  progress?: number;

  /**
   * Opaque provider continuation data preserved across AG-UI runs.
   * Hashbrown does not inspect or display this value.
   */
  encryptedValue?: string;

  /** Provider metadata preserved across AG-UI runs. */
  metadata?: Metadata;
};

/**
 * @public
 */
export interface AssistantMessage<Output, ToolUnion extends AnyTool> {
  /**
   * The canonical AG-UI message id. It is the same while the message streams
   * and after it is committed.
   */
  readonly id: string;
  role: 'assistant';
  content?: Output;
  toolCalls: ToolCall<ToolUnion>[];

  /**
   * Tool calls the agent server executed itself, in the order the model made
   * them, as `ServerToolCall` records. Present only when the message carries
   * at least one.
   */
  readonly serverToolCalls?: readonly ServerToolCall[];

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
 * A synthetic message describing a failed run. It has no id because it is
 * never part of the canonical AG-UI history.
 *
 * @public
 */
export type ErrorMessage = {
  role: 'error';
  content: string;
};

/**
 * @public
 */
export type Message<Output, Tools extends AnyTool> =
  UserMessage | AssistantMessage<Output, Tools> | ErrorMessage;

/**
 * @public
 */
export type AnyMessage = Message<string | object, AnyTool>;

/**
 * A user message as an app supplies it, for example to `sendMessage`. The
 * `id` is optional: Hashbrown keeps a supplied id and mints one when absent.
 *
 * @public
 */
export type UserMessageInput = Prettify<
  Omit<UserMessage, 'id'> & { readonly id?: string }
>;

/**
 * An assistant message as an app supplies it, for example in a saved
 * transcript passed to `setMessages`. The `id` is optional: Hashbrown keeps a
 * supplied id and mints one when absent.
 *
 * @public
 */
export interface AssistantMessageInput<
  Output,
  ToolUnion extends AnyTool,
> extends Omit<AssistantMessage<Output, ToolUnion>, 'id'> {
  /** The canonical AG-UI message id, when the app already has one. */
  readonly id?: string;
}

/**
 * A message as an app supplies it to `setMessages`, initial `messages` or
 * `sendMessage`. It is a {@link Message} whose `id` is optional: Hashbrown
 * keeps a supplied id, so a saved transcript restores with the same ids, and
 * mints one only when the id is absent.
 *
 * @public
 */
export type MessageInput<Output, Tools extends AnyTool> =
  UserMessageInput | AssistantMessageInput<Output, Tools> | ErrorMessage;

/**
 * A {@link MessageInput} for any output and tool set.
 *
 * @public
 */
export type AnyMessageInput = MessageInput<string | object, AnyTool>;
