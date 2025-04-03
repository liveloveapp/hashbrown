import { computed, Signal, Type } from '@angular/core';
import { BoundTool, createTool } from './create-tool.fn';
import { ChatMessage } from './types';
import { chatResource } from './chat-resource.fn';
import { s } from './schema';

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

type ChatComponent<Name extends string, T> = {
  name: Name;
  description: string;
  component: Type<T>;
  inputs: Partial<{
    [K in keyof T]: T[K] extends Signal<infer U> ? s.Schema<U> : never;
  }>;
};

export function defineChatComponent<Name extends string, T>(
  name: Name,
  description: string,
  component: Type<T>,
  inputs: Partial<{
    [K in keyof T]: T[K] extends Signal<infer U> ? s.Schema<U> : never;
  }>
) {
  console.log(component);
  return { name, description, component, inputs };
}

export function richChatResource(args: {
  components?: ChatComponent<string, unknown>[];
  model: string | Signal<string>;
  temperature?: number | Signal<number>;
  maxTokens?: number | Signal<number>;
  messages?: ChatMessage[];
  tools?: BoundTool[];
}) {
  // const ui = z.object({
  //   ui: z.union([
  //     ...(args.components ?? []).map((component) => {
  //       return z.object({
  //         name: z.literal(component.name),
  //         inputs: z.object(
  //           Object.keys(component.inputs).reduce((acc, key) => {
  //             (acc as any)[key] = component.inputs[key];
  //             return acc;
  //           }, {} as Record<string, ZodTypeAny>)
  //         ),
  //       });
  //     }),
  //   ] as any),
  // });

  const ui = s.object('UI', {
    ui: s.anyOf('Any one of the following components', [
      ...(args.components ?? []).map((component) => {
        return s.object(component.name, {
          name: s.string(`Must be ${component.name}`),
          inputs: s.object(
            'Values to pass to the component',
            Object.keys(component.inputs).reduce((acc, key) => {
              (acc as any)[key] = (component.inputs as any)[key];
              return acc;
            }, {} as Record<string, s.AnyType>)
          ),
        });
      }),
    ]),
  });

  const showComponentInstruction = computed(() => {
    if (!args.components || args.components.length === 0) {
      return '';
    }

    return `
     ## showComponent
        This tool is running in an Angular app. The angular app developer has
        provided you with a list of components that can be used to convey
        information to the user.

        If you want to show a component to the user, you can use the 
        \`showComponent\` tool.

        The \`showComponent\` tool takes two arguments:
        - The name of the component to show
        - The inputs to pass to the component
        
        The inputs must match the expected inputs for the component.        
        
        Here is the description of each component:
        ${args.components
          .map((c) => `- ${c.name}: ${c.description}`)
          .join('\n')}
    `;
  });

  const chat = chatResource({
    model: args.model,
    temperature: args.temperature,
    maxTokens: args.maxTokens,
    // messages: args.messages,
    messages: [
      {
        role: 'system',
        content: `
        You are chatbot chatting with a human on my web app. Please be 
        curteuous, helpful, and friendly. Try to answer all questions 
        to the best of your ability. Keep answers concise and to the point.

        Today's date is ${new Date().toLocaleDateString()}.

        # Tools
        ${showComponentInstruction()}
       
        `,
      },
    ],
    tools: [
      ...(args.tools ?? []),
      ...(args.components && args.components.length
        ? [
            createTool({
              name: 'showComponent',
              description: `
        Show a component to the user.

        The component must be one of the following:
        ${args.components?.map((c) => c.name).join(', ') ?? ''}
        `,
              schema: ui,
              handler: async (input) => {
                console.log(input);
                return {};
              },
            }),
          ]
        : []),
    ],
  });

  return chat;
}
