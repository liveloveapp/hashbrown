import { z, ZodObject, ZodTypeAny } from 'zod';
import { Signal, Type } from '@angular/core';
import { BoundTool } from './create-tool.fn';
import { ChatMessage } from './types';
import { chatResource } from './chat-resource.fn';
/**
const UI = z.lazy(() =>
  z.object({
    type: z.enum(["div", "button", "header", "section", "field", "form"]),
    label: z.string(),
    children: z.array(UI),
    attributes: z.array(
      z.object({
        name: z.string(),
        value: z.string(),
      })
    ),
  })
);
 */

type RichChatComponent<Input extends Record<string, ZodTypeAny>> = {
  input: Input;
  component: Type<{
    input: z.infer<ZodObject<Input>>;
  }>;
};

export type RichChatElements = {
  [tagName: string]:
    | {
        element: HTMLElement;
      }
    | RichChatComponent<any>;
};

export function richChatResource(args: {
  ui: RichChatElements;
  model: string | Signal<string>;
  temperature?: number | Signal<number>;
  maxTokens?: number | Signal<number>;
  messages?: ChatMessage[];
  tools?: BoundTool[];
}) {
  const elementUnion = z.record(
    z.string(),
    z.union([
      z.object({
        element: z.instanceof(HTMLElement),
      }),
      z.object({
        input: z.record(z.string(), z.instanceof(ZodTypeAny)),
        component: z.custom<Type<{ input: any }>>((val) => val !== undefined),
      }),
    ])
  );

  // const chat = chatResource({
  //   model: args.model,
  //   temperature: args.temperature,
  //   maxTokens: args.maxTokens,
  //   messages: args.messages,
  //   tools: args.tools,
  //   responseFormat: {},
  // });
}
