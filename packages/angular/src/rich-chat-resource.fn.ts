import { computed, Signal, Type } from '@angular/core';
import { Chat, ExposedComponent, s } from '@hashbrownai/core';
import { ChatResource, chatResource } from './chat-resource.fn';
import { BoundTool, createToolWithArgs } from './create-tool.fn';

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace RichChat {
  export type AssistantMessage = {
    role: 'assistant';
    content: string;
  };

  export type ComponentMessage<Name extends string, T> = {
    role: 'component';
    name: Name;
    component: Type<T>;
    inputs: object;
  };

  export type ToolCallMessage = {
    role: 'tool';
    name: string;
    callId: string;
    isPending: boolean;
    result?: unknown;
    error?: string;
  };

  export type Message =
    | RichChat.ComponentMessage<string, unknown>
    | RichChat.ToolCallMessage
    | RichChat.AssistantMessage
    | Chat.UserMessage
    | Chat.SystemMessage;
}

export interface RichChatResource extends ChatResource {
  messages: Signal<RichChat.Message[]>;
}

export function richChatResource(args: {
  components?: ExposedComponent<any>[];
  model: string | Signal<string>;
  temperature?: number | Signal<number>;
  maxTokens?: number | Signal<number>;
  messages?: Chat.Message[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools?: BoundTool<string, any>[];
}): RichChatResource {
  const ui = s.object('UI', {
    ui: s.anyOf('Any one of the following components', [
      ...(args.components ?? []).map((component) => {
        return s.object(component.name, {
          name: s.string(`Must be ${component.name}`),
          inputs: s.object(
            'Values to pass to the component',
            Object.keys(component.props ?? {}).reduce(
              (acc, key) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (acc as any)[key] = (component.props as any)[key];
                return acc;
              },
              {} as Record<string, s.AnyType>,
            ),
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
            createToolWithArgs({
              name: 'showComponent',
              description: `
        Show a component to the user.

        The component must be one of the following:
        ${args.components?.map((c) => c.name).join(', ') ?? ''}
        `,
              schema: ui,
              handler: async (input) => {
                console.log('Component handler invoked', input);
                return {};
              },
            }),
          ]
        : []),
    ],
  });

  const messages = computed(() => {
    const messages = chat.value();

    return messages.flatMap((message): RichChat.Message[] => {
      if (message.role === 'tool') {
        return [];
      }
      if (message.role === 'assistant') {
        const toolCalls = message.tool_calls ?? [];

        if (toolCalls.length === 0) {
          const simpleMessage: RichChat.AssistantMessage = {
            role: 'assistant',
            content: message.content ?? '',
          };
          return [simpleMessage];
        }
        const toolCallMessages = toolCalls.flatMap(
          (
            toolCall,
          ): Array<
            | RichChat.ToolCallMessage
            | RichChat.ComponentMessage<string, unknown>
          > => {
            const toolCallMessage = messages.find(
              (t): t is Chat.ToolMessage =>
                t.role === 'tool' && t.tool_call_id === toolCall.id,
            );
            const toolName = toolCall.function.name;
            const content = toolCallMessage?.content;
            const result =
              content && content.type === 'success'
                ? content.content
                : undefined;
            const error =
              content && content.type === 'error' ? content.error : undefined;

            if (toolName === 'showComponent') {
              let uiValue: s.Infer<typeof ui>;
              try {
                uiValue = s.parse(ui, JSON.parse(toolCall.function.arguments));
              } catch (error) {
                console.error(error);
                return [];
              }
              const componentName = uiValue.ui.name;
              const componentInputs = uiValue.ui.inputs;
              const componentType = args.components?.find(
                (c) => c.name === componentName,
              )?.component;

              if (
                uiValue &&
                componentName &&
                componentInputs &&
                componentType
              ) {
                const componentMessage: RichChat.ComponentMessage<
                  string,
                  unknown
                > = {
                  role: 'component',
                  name: componentName,
                  component: componentType as Type<unknown>,
                  inputs: componentInputs,
                };
                return [componentMessage];
              }
            }

            return [
              {
                role: 'tool',
                result,
                error,
                name: toolCall.function.name,
                callId: toolCall.id,
                isPending: result === undefined,
              },
            ];
          },
        );

        return toolCallMessages;
      }
      if (message.role === 'user') {
        return [message];
      }
      if (message.role === 'system') {
        return [];
      }

      throw new Error(`Unknown message role`);
    });
  });

  return {
    ...chat,
    messages,
  };
}
