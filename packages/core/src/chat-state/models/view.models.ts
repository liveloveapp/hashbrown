/* eslint-disable @typescript-eslint/no-explicit-any */
import { s } from '../../schema';
import { Prettify } from '../../utils';

export type Tool<Name, ArgsSchema extends s.HashbrownType, Result> = {
  name: Name;
  description: string;
  schema: ArgsSchema;
  handler: (input: ArgsSchema, abortSignal: AbortSignal) => Promise<Result>;
};

export type AnyTool = Tool<any, any, any>;

export type UserMessage = {
  role: 'user';
  content: string;
};

export type ToolCall<ToolUnion extends AnyTool> = Prettify<
  ToolUnion extends Tool<infer Name, infer ArgsSchema, infer Result>
    ?
        | {
            role: 'tool';
            status: 'done';
            name: Name;
            args: s.Infer<ArgsSchema>;
            result: PromiseSettledResult<Result>;
            toolCallId: string;
          }
        | {
            role: 'tool';
            status: 'pending';
            name: Name;
            toolCallId: string;
            progress?: number;
          }
    : never
>;

export type AnyToolCall = ToolCall<AnyTool>;

export type AssistantMessage<
  OutputSchemaOrString extends string | s.HashbrownType,
  ToolUnion extends AnyTool,
> = Prettify<
  OutputSchemaOrString extends string
    ? {
        role: 'assistant';
        content?: OutputSchemaOrString;
        toolCalls: ToolCall<ToolUnion>[];
      }
    : OutputSchemaOrString extends s.HashbrownType
      ? {
          role: 'assistant';
          content?: s.Infer<OutputSchemaOrString>;
          toolCalls: ToolCall<ToolUnion>[];
        }
      : never
>;

export type Message<
  OutputSchemaOrString extends string | s.HashbrownType,
  Tools extends AnyTool,
> = UserMessage | AssistantMessage<OutputSchemaOrString, Tools>;

export type AnyMessage = Message<string | s.HashbrownType, AnyTool>;
