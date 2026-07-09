/* eslint-disable @typescript-eslint/no-explicit-any */
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
    ?
        | {
            role: 'tool';
            status: 'done';
            name: Name;
            args: Args;
            result: PromiseSettledResult<Result>;
            toolCallId: string;
          }
        | {
            role: 'tool';
            status: 'pending';
            name: Name;
            args: Args;
            toolCallId: string;
            progress?: number;
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
  | UserMessage
  | AssistantMessage<Output, Tools>
  | ErrorMessage;

/**
 * @public
 */
export type AnyMessage = Message<string | object, AnyTool>;
