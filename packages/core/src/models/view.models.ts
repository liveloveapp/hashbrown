/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ReasoningMessage } from '@ag-ui/core';
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
 * @public
 */
export type UserMessage = {
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
          metadata?: Record<string, unknown>;
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
          metadata?: Record<string, unknown>;
        }
    : never
>;

/**
 * @public
 */
export type AnyToolCall = ToolCall<AnyTool>;

/**
 * @public
 */
export interface AssistantMessage<Output, ToolUnion extends AnyTool> {
  role: 'assistant';
  content?: Output;
  toolCalls: ToolCall<ToolUnion>[];

  /**
   * Opaque provider continuation data preserved across AG-UI runs.
   * Hashbrown does not inspect or display this value.
   */
  encryptedValue?: string;

  /** Provider metadata preserved across AG-UI runs. */
  metadata?: Record<string, unknown>;

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
