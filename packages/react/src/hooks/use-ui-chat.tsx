/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Chat,
  createComponentSchema,
  ExposedComponent,
  s,
} from '@hashbrownai/core';
import React, { useCallback, useMemo } from 'react';
import { ChatOptions } from './use-chat';
import { useStructuredChat } from './use-structured-chat';

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

/**
 * @todo U.G. Wilson - This is now actually a StructuredChat since it has a response schema. Convert it.
 */
export const useUiChat = (options: UiChatOptions) => {
  const elements = useMemo(
    () => createComponentSchema(options.components),
    [options.components],
  );
  const ui = useMemo(() => {
    return s.object('UI', {
      ui: s.streaming.array('List of elements', elements),
    });
  }, [elements]);

  const systemMessage = `
        You are chatbot chatting with a human on my web app. Please be
        curteuous, helpful, and friendly. Try to answer all questions
        to the best of your ability. Keep answers concise and to the point.

        If the user asks you for things, strongly prefer to provide controls 
        components organized in cards.

        Today's date is ${new Date().toLocaleDateString()}.

        NEVER use ANY newline strings such as "\\n" or "\\\\n" in your response.
        `;

  const chat = useStructuredChat({
    ...options,
    messages: [
      {
        role: 'system',
        content: systemMessage,
      },
    ],
    output: ui,
    tools: [...(options.tools ?? [])],
  });

  const findToolCallMessage = useCallback(
    (toolCallId: string) => {
      return chat.messages.find(
        (t): t is Chat.ToolMessage =>
          t.role === 'tool' && t.tool_call_id === toolCallId,
      );
    },
    [chat.messages],
  );

  const buildContent = useCallback(
    (
      nodes: Array<s.Infer<typeof elements>>,
      parentKey = '',
    ): React.ReactElement[] => {
      const elements = nodes.map((element, index) => {
        console.log(element);
        const componentName = element.$tagName;
        const componentInputs = element.$props;
        const componentType = options.components?.find(
          (c) => c.name === componentName,
        )?.component;
        const key = `${parentKey}_${index}`;

        if (componentName && componentInputs && componentType) {
          const children: React.ReactNode[] | null = element.$children
            ? buildContent(element.$children, key)
            : null;

          return React.createElement(componentType, {
            ...componentInputs,
            children,
            key,
          });
        }

        throw new Error(`Unknown element type. ${componentName}`);
      });

      return elements;
    },
    [options.components],
  );

  const uiChatMessages = useMemo(() => {
    return chat.messages.flatMap((message, index): UiChat.Message[] => {
      if (message.role === 'tool' || message.role === 'system') {
        return [];
      }
      if (message.role === 'user') {
        return [message];
      }
      if (message.role === 'assistant') {
        const toolCalls = message.tool_calls ?? [];

        if (message.content) {
          console.log(message.content);
          const renderedMessage: UiChat.AssistantMessage = {
            role: 'assistant',
            // eslint-disable-next-line react/jsx-no-useless-fragment
            content: <>{...buildContent(message.content.ui, `${index}`)}</>,
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

      throw new Error(`Unknown message role. ${(message as any).role}`);
    });
  }, [buildContent, chat.messages, findToolCallMessage]);

  return {
    ...chat,
    messages: uiChatMessages,
  };
};
