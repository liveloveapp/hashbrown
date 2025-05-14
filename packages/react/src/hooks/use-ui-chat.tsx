/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Chat,
  createComponentSchema,
  ExposedComponent,
  s,
} from '@hashbrownai/core';
import React, { useCallback, useMemo, useState } from 'react';
import { useStructuredChat } from './use-structured-chat';

const publicSchema = s.object('UI', {
  ui: s.streaming.array(
    'List of elements',
    s.object('Component', {
      $tagName: s.string(''),
      $props: s.object('', {}),
      get $children() {
        return s.array('', publicSchema);
      },
    }),
  ),
});

export type UiAssistantMessage<Tools extends Chat.AnyTool> =
  Chat.AssistantMessage<typeof publicSchema, Tools> & {
    ui: React.ReactElement[] | null;
  };

export type UiUserMessage = Chat.UserMessage;

export type UiChatMessage<Tools extends Chat.AnyTool> =
  | UiAssistantMessage<Tools>
  | UiUserMessage;

export interface UiChatOptions<Tools extends Chat.AnyTool> {
  /**
   * The LLM model to use for the chat.
   *
   */
  model: string;

  /**
   * The prompt to use for the chat.
   */
  prompt: string;

  components: ExposedComponent<any>[];

  /**
   * The initial messages for the chat.
   * default: 1.0
   */
  messages?: Chat.Message<typeof publicSchema, Tools>[];
  /**
   * The tools to make available use for the chat.
   * default: []
   */
  tools?: Tools[];

  /**
   * The temperature for the chat.
   */
  temperature?: number;

  /**
   * The maximum number of tokens to allow.
   * default: 5000
   */
  maxTokens?: number;

  /**
   * The debounce time between sends to the endpoint.
   * default: 150
   */
  debounceTime?: number;

  /**
   * The name of the hook, useful for debugging.
   */
  debugName?: string;
}

export const useUiChat = <Tools extends Chat.AnyTool>(
  options: UiChatOptions<Tools>,
) => {
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
  const chat = useStructuredChat({
    ...chatOptions,
    schema: ui,
  });

  const buildContent = useCallback(
    (
      nodes: Array<s.Infer<typeof elements>>,
      parentKey = '',
    ): React.ReactElement[] => {
      const elements = nodes.map((element, index) => {
        const key = `${parentKey}_${index}`;

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
    return chat.messages.map((message): UiChatMessage<Tools> => {
      if (message.role === 'assistant') {
        return {
          ...message,
          ui: message.content?.ui ? buildContent(message.content.ui) : null,
        } as UiAssistantMessage<Tools>;
      }
      return message;
    });
  }, [buildContent, chat.messages]);

  return {
    ...chat,
    messages: uiChatMessages,
    setComponents,
  };
};
