/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Chat,
  createComponentSchema,
  ExposedComponent,
  s,
} from '@hashbrownai/core';
import React, { useCallback, useMemo, useState } from 'react';
import { UseChatOptions } from './use-chat';
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
    | Chat.AssistantMessage
    | Chat.SystemMessage;
}

export interface UiChatOptions extends Omit<UseChatOptions, 'messages'> {
  components: ExposedComponent<any>[];
}

export const useUiChat = (options: UiChatOptions) => {
  const { components: initialComponents, ...chatOptions } = options;
  const [components, setComponents] = useState(initialComponents);
  const elements = useMemo(
    () => createComponentSchema(components),
    [components],
  );
  const ui = useMemo(() => {
    return s.object('UI', {
      ui: s.streaming.array('List of elements', elements),
    });
  }, [elements]);

  const systemMessage = useMemo(() => {
    return `
        You are chatbot chatting with a human on my web app. Please be
        curteuous, helpful, and friendly. Try to answer all questions
        to the best of your ability. Keep answers concise and to the point.

        If the user asks you for things, strongly prefer to provide controls 
        components organized in cards.

        Today's date is ${new Date().toLocaleDateString()}.

        NEVER use ANY newline strings such as "\\n" or "\\\\n" in your response.
        `;
  }, []);

  const chat = useStructuredChat({
    ...chatOptions,
    messages: [
      {
        role: 'system',
        content: systemMessage,
      },
    ],
    output: ui,
  });

  // TODO: see if I can go with fewer guards on message content now

  const buildContent = useCallback(
    (
      nodes: Array<s.Infer<typeof elements>>,
      parentKey = '',
    ): React.ReactElement[] => {
      const elements = nodes.map((element, index) => {
        const key = `${parentKey}_${index}`;

        if (!('$tagName' in element && '$props' in element)) {
          return React.createElement(React.Fragment, {
            key,
          });
        }

        const componentName = element.$tagName;
        const componentInputs = element.$props;
        const componentType = components?.find(
          (c) => c.name === componentName,
        )?.component;

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
    [components],
  );

  const uiChatMessages = useMemo(() => {
    const findToolCallMessage = (toolCallId: string) => {
      return chat.messages.find(
        (t): t is Chat.ToolMessage =>
          t.role === 'tool' && t.tool_call_id === toolCallId,
      );
    };

    return chat.messages.flatMap((message, index): UiChat.Message[] => {
      if (message.role === 'tool' || message.role === 'system') {
        return [];
      }
      if (message.role === 'user') {
        return [message];
      }
      if (message.role === 'assistant') {
        const toolCalls = message.tool_calls ?? [];

        const toolCallMessages = toolCalls.map(
          (toolCall): UiChat.ToolCallMessage => {
            const toolCallMessage = findToolCallMessage(toolCall.id);
            const toolName = toolCall.function.name;
            const toolContent = toolCallMessage?.content;
            const toolResult =
              toolContent && toolContent.status === 'fulfilled'
                ? toolContent.value
                : undefined;
            const toolError =
              toolContent && toolContent.status === 'rejected'
                ? toolContent.reason
                : undefined;

            return {
              role: 'tool',
              name: toolName,
              callId: toolCall.id,
              isPending: toolResult === undefined,
              result: toolResult,
              error: toolError,
            };
          },
        );

        if (
          message.content &&
          (message as any).content !== '' &&
          message.content.ui
        ) {
          const renderedMessage: UiChat.AssistantMessage = {
            role: 'assistant',
            // eslint-disable-next-line react/jsx-no-useless-fragment
            content: <>{...buildContent(message.content.ui, `${index}`)}</>,
          };

          return [...toolCallMessages, renderedMessage];
        }

        return toolCallMessages;
      }

      throw new Error(`Unknown message role. ${(message as any).role}`);
    });
  }, [buildContent, chat.messages]);

  const result = useMemo(() => {
    return {
      ...chat,
      messages: uiChatMessages,
      setComponents,
    };
  }, [chat, uiChatMessages, setComponents]);

  return result;
};
