import { Chat, ExposedComponent, s } from '@hashbrownai/core';
import React from 'react';
import { createToolWithArgs } from './create-tool.fn';
import { ChatOptions, useChat } from './use-chat';

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace UiChat {
  export type AssistantMessage = {
    role: 'assistant';
    content: string;
  };

  export type ComponentMessage<Name extends string, T> = {
    role: 'component';
    name: Name;
    component: React.ReactElement;
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
    | UiChat.ComponentMessage<string, unknown>
    | UiChat.ToolCallMessage
    | UiChat.AssistantMessage
    | Chat.UserMessage
    | Chat.SystemMessage;
}

export interface UiChatOptions extends Omit<ChatOptions, 'messages'> {
  components: ExposedComponent<any>[];
}

export const useUiChat = (options: UiChatOptions) => {
  const ui = s.object('UI', {
    ui: s.anyOf('Any one of the following components', [
      ...(options.components ?? []).map((component) => {
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

  const showComponentInstruction = () => {
    if (!options.components || options.components.length === 0) {
      return '';
    }

    return `
     ## showComponent
        This tool is running in a React app. The react app developer has
        provided you with a list of components that can be used to convey
        information to the user.

        If you want to show a component to the user, you can use the
        \`showComponent\` tool.

        The \`showComponent\` tool takes two arguments:
        - The name of the component to show
        - The inputs to pass to the component

        The inputs must match the expected inputs for the component.

        Here is the description of each component:
        ${options.components
          .map((c) => `- ${c.name}: ${c.description}`)
          .join('\n')}
    `;
  };

  const systemMessage = `
        You are chatbot chatting with a human on my web app. Please be
        curteuous, helpful, and friendly. Try to answer all questions
        to the best of your ability. Keep answers concise and to the point.

        Today's date is ${new Date().toLocaleDateString()}.

        # Tools
        ${showComponentInstruction()}`;

  const chat = useChat({
    ...options,
    messages: [
      {
        role: 'system',
        content: systemMessage,
      },
    ],
    tools: [
      ...(options.tools ?? []),
      ...(options.components && options.components.length
        ? [
            createToolWithArgs({
              name: 'showComponent',
              description: `Show a component to the user.

          The component must be one of the following:
          ${options.components?.map((c) => c.name).join(', ') ?? ''}
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

  const findToolCallMessage = (toolCallId: string) => {
    return chat.messages.find(
      (t): t is Chat.ToolMessage =>
        t.role === 'tool' && t.tool_call_id === toolCallId,
    );
  };

  const uiChatMessages = chat.messages.flatMap(
    (message: Chat.Message): UiChat.Message[] => {
      if (message.role === 'tool' || message.role === 'system') {
        return [];
      }
      if (message.role === 'user') {
        return [message];
      }
      if (message.role === 'assistant') {
        const toolCalls = message.tool_calls ?? [];

        const isSimpleMessage = toolCalls.length === 0;
        if (isSimpleMessage) {
          const simpleMessage: UiChat.AssistantMessage = {
            role: 'assistant',
            content: message.content ?? '',
          };
          return [simpleMessage];
        }

        const toolCallMessages = toolCalls.flatMap(
          (
            toolCall,
          ): Array<
            UiChat.ToolCallMessage | UiChat.ComponentMessage<string, unknown>
          > => {
            const toolCallMessage = findToolCallMessage(toolCall.id);
            const toolName = toolCall.function.name;
            const toolContent = toolCallMessage?.content;
            const toolResult =
              toolContent && toolContent.type === 'success'
                ? toolContent.content
                : undefined;
            const toolError =
              toolContent && toolContent.type === 'error'
                ? toolContent.error
                : undefined;

            console.dir([toolCallMessage, toolName, toolResult, toolError], {
              depth: null,
            });

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
              const componentType = options.components?.find(
                (c) => c.name === componentName,
              )?.component;

              if (
                uiValue &&
                componentName &&
                componentInputs &&
                componentType
              ) {
                const componentMessage: UiChat.ComponentMessage<
                  string,
                  unknown
                > = {
                  role: 'component',
                  name: componentName,
                  component: React.createElement(
                    componentType,
                    componentInputs,
                  ),
                };
                return [componentMessage];
              }
            }

            return [
              {
                role: 'tool',
                name: toolName,
                callId: toolCall.id,
                isPending: toolResult === undefined,
                result: toolResult,
                error: toolError,
              },
            ];
          },
        );

        return toolCallMessages;
      }

      throw new Error(`Unknown message role. ${message.role}`);
    },
  );

  console.log(uiChatMessages);

  return {
    ...chat,
    messages: uiChatMessages,
  };
};
