/* eslint-disable @typescript-eslint/no-explicit-any */
import { s } from '../schema';
import { Prettify } from '../utils';

export type Middleware = (
  fetchInit: RequestInit,
) => RequestInit | Promise<RequestInit>;

export type Tool<Name, Args, Result> = {
  name: Name;
  description: string;
  schema: s.HashbrownType;
  handler: (input: Args, abortSignal: AbortSignal) => Promise<Result>;
};

export type AnyTool = Tool<any, any, any>;

export type UserMessage = {
  role: 'user';
  content: string;
};

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

export type AnyToolCall = ToolCall<AnyTool>;

export interface AssistantMessage<Output, ToolUnion extends AnyTool> {
  role: 'assistant';
  content?: Output;
  toolCalls: ToolCall<ToolUnion>[];
}

export type ErrorMessage = {
  role: 'error';
  content: string;
};

export type Message<Output, Tools extends AnyTool> =
  | UserMessage
  | AssistantMessage<Output, Tools>
  | ErrorMessage;

export type AnyMessage = Message<string | object, AnyTool>;
