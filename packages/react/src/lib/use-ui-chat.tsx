import {
  Chat,
  createComponentSchema,
  ExposedComponent,
  s,
} from '@hashbrownai/core';
import React from 'react';
import { ChatOptions, useChat } from './use-chat';

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace UiChat {
  export type AssistantMessage = {
    role: 'assistant';
    content: React.ReactElement | null;
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
    ui: s.streaming.array(
      'List of elements',
      createComponentSchema(options.components),
    ),
  });

  const systemMessage = `
        You are chatbot chatting with a human on my web app. Please be
        curteuous, helpful, and friendly. Try to answer all questions
        to the best of your ability. Keep answers concise and to the point.

        Today's date is ${new Date().toLocaleDateString()}.

        NEVER use ANY newline strings such as "\\n" or "\\\\n" in your response.
        `;

  const chat = useChat({
    ...options,
    messages: [
      {
        role: 'system',
        content: systemMessage,
      },
    ],
    responseSchema: ui,
    tools: [...(options.tools ?? [])],
  });

  const findToolCallMessage = (toolCallId: string) => {
    return chat.messages.find(
      (t): t is Chat.ToolMessage =>
        t.role === 'tool' && t.tool_call_id === toolCallId,
    );
  };

  // console.dir([toolCallMessage, toolName, toolResult, toolError], {
  //   depth: null,
  // });

  // if (toolName === 'showComponent') {
  //   let uiValue: s.Infer<typeof ui>;
  //   try {
  //     uiValue = s.parse(ui, JSON.parse(toolCall.function.arguments));
  //   } catch (error) {
  //     console.error(error);
  //     return [];
  //   }
  //   const componentName = uiValue.ui.name;
  //   const componentInputs = uiValue.ui.inputs;
  //   const componentType = options.components?.find(
  //     (c) => c.name === componentName,
  //   )?.component;

  //   if (
  //     uiValue &&
  //     componentName &&
  //     componentInputs &&
  //     componentType
  //   ) {
  //     const componentMessage: UiChat.ComponentMessage<
  //       string,
  //       unknown
  //     > = {
  //       role: 'component',
  //       name: componentName,
  //       component: React.createElement(
  //         componentType,
  //         componentInputs,
  //       ),
  //     };
  //     return [componentMessage];
  //   }
  // }

  const buildComponent = (
    renderableContent: s.Infer<typeof ui>,
  ): React.ReactElement | null => {
    const elements = renderableContent.ui.map((element) => {
      const componentName = element.$tagName;
      const componentInputs = element.$props;
      const componentType = options.components?.find(
        (c) => c.name === componentName,
      )?.component;

      if (componentName && componentInputs && componentType) {
        const children: React.ReactNode[] | null = element.$children
          ? element.$children.map((child) => buildComponent({ ui: [child] }))
          : null;

        return React.createElement(componentType, {
          ...componentInputs,
          children,
        });
      }

      return null;
    });

    return elements.length === 1
      ? elements[0]
      : React.createElement(React.Fragment, null, elements);
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

        const hasContent = toolCalls.length === 0;
        if (hasContent) {
          let renderableContent: s.Infer<typeof ui> | undefined;

          try {
            renderableContent = s.parse(ui, JSON.parse(message.content ?? ''));
          } catch (error) {
            if (error instanceof SyntaxError) {
              return [];
            }
            throw error;
          }

          if (!renderableContent) {
            return [];
          }

          console.log('renderableContent', renderableContent);

          /* Example renderableContent:
          {
    "ui": [
        {
            "$tagName": "MarkdownComponent",
            "$props": {
                "content": "I'm your friendly chatbot assistant, here to help you with your questions and tasks! You can call me whatever you like."
            }
        }
    ]
}*/
          const renderedMessage: UiChat.AssistantMessage = {
            role: 'assistant',
            content: buildComponent(renderableContent),
          };

          return [renderedMessage];
        }

        const toolCallMessages = toolCalls.flatMap(
          (toolCall): Array<UiChat.ToolCallMessage> => {
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

  console.debug('uiChatMessages', uiChatMessages);

  return {
    ...chat,
    messages: uiChatMessages,
  };
};
