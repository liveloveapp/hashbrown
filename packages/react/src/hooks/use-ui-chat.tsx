/* eslint-disable @typescript-eslint/no-explicit-any */
import { Chat, KnownModelIds, s, ɵcomponents } from '@hashbrownai/core';
import React, { useCallback, useMemo, useState } from 'react';
import { ExposedComponent } from '../expose-component.fn';
import { useStructuredChat } from './use-structured-chat';

/**
 * Represents a UI component in the chat schema with its properties and children.
 */
export interface UiChatSchemaComponent {
  /** The name of the component to render */
  $tagName: string;
  /** The props to pass to the component */
  $props: Record<string, any>;
  /** Child components to render inside this component */
  $children: UiChatSchemaComponent[];
}

/**
 * The schema for UI components in the chat.
 */
export interface UiChatSchema {
  /** Array of UI components to render */
  ui: UiChatSchemaComponent[];
}

/**
 * A message from the assistant that includes rendered UI components.
 * Extends the base assistant message with UI-specific content.
 */
export type UiAssistantMessage<Tools extends Chat.AnyTool> =
  Chat.AssistantMessage<UiChatSchema, Tools> & {
    /** The rendered React elements from the assistant's response */
    ui: React.ReactElement[] | null;
  };

/**
 * A message from the user in the UI chat.
 * Uses the standard user message type from the chat system.
 */
export type UiUserMessage = Chat.UserMessage;

/**
 * An error message in the UI chat.
 * Uses the standard error message type from the chat system.
 */
export type UiErrorMessage = Chat.ErrorMessage;

/**
 * Union type of all possible message types in the UI chat.
 * Can be an assistant message with UI components, a user message, or an error message.
 */
export type UiChatMessage<Tools extends Chat.AnyTool> =
  | UiAssistantMessage<Tools>
  | UiErrorMessage
  | UiUserMessage;

/**
 * Options for the `useUiChat` hook.
 */
export interface UiChatOptions<Tools extends Chat.AnyTool> {
  /**
   * The LLM model to use for the chat.
   */
  model: KnownModelIds;

  /**
   * The system message to use for the chat.
   */
  system: string;

  /**
   * The components that can be rendered by the chat.
   */
  components: ExposedComponent<any>[];

  /**
   * The initial messages for the chat.
   * default: []
   */
  messages?: Chat.Message<UiChatSchema, Tools>[];

  /**
   * The tools to make available for the chat.
   * default: []
   */
  tools?: Tools[];

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

/**
 * This React hook creates a chat instance that can generate and render UI components.
 * The result object contains functions and state enabling you to send and receive messages and monitor the state of the chat.
 *
 * @description
 * The `useUiChat` hook provides functionality for generating UI components through chat. This is particularly useful for:
 * - Dynamic UI generation
 * - Interactive chat interfaces
 * - Component-based responses
 * - Building chat-based UIs
 *
 * @returns {UseUiChatResult} An object containing chat state, functions to interact with the chat, and rendered UI components.
 *
 * @example
 * In this example, the LLM will respond with a UI component that can be rendered directly in your React application.
 * ```tsx
 * const { messages, sendMessage } = useUiChat({
 *   model: 'gpt-4o',
 *   system: 'You are a helpful assistant that can generate UI components.',
 *   components: [
 *     exposeComponent(Button, {
 *       name: 'Button',
 *       description: 'A clickable button component',
 *       props: {
 *         label: s.string('The text to display on the button'),
 *         onClick: s.function('Function to call when clicked')
 *       }
 *     })
 *   ]
 * });
 * ```
 */
export const useUiChat = <Tools extends Chat.AnyTool>(
  options: UiChatOptions<Tools>,
) => {
  const { components: initialComponents, ...chatOptions } = options;
  const [components, setComponents] = useState(initialComponents);
  const [flattenedComponents, setFlattenedComponents] = useState(
    ɵcomponents.flattenComponents(initialComponents),
  );
  const ui = useMemo(() => {
    return s.object('UI', {
      ui: s.streaming.array(
        'List of elements',
        ɵcomponents.createComponentSchema(components),
      ),
    });
  }, [components]);
  const chat = useStructuredChat({
    ...chatOptions,
    schema: ui,
  });

  const buildContent = useCallback(
    (
      nodes: Array<UiChatSchemaComponent>,
      parentKey = '',
    ): React.ReactElement[] => {
      const elements = nodes.map((element, index) => {
        const key = `${parentKey}_${index}`;

        const componentName = element.$tagName;
        const componentInputs = element.$props;
        const componentType = flattenedComponents.get(componentName)?.component;

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
