/* eslint-disable @typescript-eslint/no-explicit-any */
import { Chat, KnownModelIds, s, SystemPrompt, ɵui } from '@hashbrownai/core';
import {
  createElement,
  ReactElement,
  ReactNode,
  useCallback,
  useMemo,
  useState,
} from 'react';
import { ExposedComponent } from '../expose-component.fn';
import { useStructuredChat } from './use-structured-chat';

/**
 * Represents a UI component in the chat schema with its properties and children.
 *
 * @public
 */
export interface UiChatSchemaComponent {
  /** The name of the component to render */
  $tag: string;
  /** Child components to render inside this component */
  $children: string | UiChatSchemaComponent[];
  /** Properties of the component */
  $props: Record<string, any>;
}

/**
 * The schema for UI components in the chat.
 *
 * @public
 */
export interface UiChatSchema {
  /** Array of UI components to render */
  ui: UiChatSchemaComponent[];
}

/**
 * A message from the assistant that includes rendered UI components.
 * Extends the base assistant message with UI-specific content.
 *
 * @public
 * @typeParam Tools - The set of tool definitions available to the chat.
 */
export type UiAssistantMessage<Tools extends Chat.AnyTool> =
  Chat.AssistantMessage<UiChatSchema, Tools> & {
    /** The rendered React elements from the assistant's response */
    ui: ReactElement[] | null;
  };

/**
 * A message from the user in the UI chat.
 * Uses the standard user message type from the chat system.
 *
 * @public
 */
export type UiUserMessage = Chat.UserMessage;

/**
 * An error message in the UI chat.
 * Uses the standard error message type from the chat system.
 *
 * @public
 */
export type UiErrorMessage = Chat.ErrorMessage;

/**
 * Union type of all possible message types in the UI chat.
 * Can be an assistant message with UI components, a user message, or an error message.
 *
 * @public
 * @typeParam Tools - The set of tool definitions available to the chat.
 */
export type UiChatMessage<Tools extends Chat.AnyTool> =
  | UiAssistantMessage<Tools>
  | UiErrorMessage
  | UiUserMessage;

/**
 * Options for the `useUiChat` hook.
 *
 * @public
 * @typeParam Tools - The set of tool definitions available to the chat.
 */
export interface UiChatOptions<
  Tools extends Chat.AnyTool,
  Lenses extends Chat.AnyLens,
> {
  /**
   * The LLM model to use for the chat.
   */
  model: KnownModelIds;

  /**
   * The system message to use for the chat.
   */
  system: string | SystemPrompt;

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
   * The lenses to make available for the chat.
   * default: []
   */
  lenses?: Lenses[];

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
 * @public
 * @typeParam Tools - The set of tool definitions available to the chat.
 * @remarks
 * The `useUiChat` hook provides functionality for generating UI components through chat. This is particularly useful for:
 * - Dynamic UI generation
 * - Interactive chat interfaces
 * - Component-based responses
 * - Building chat-based UIs
 *
 * @returns An object containing chat state, functions to interact with the chat, and rendered UI components.
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
export const useUiChat = <
  Tools extends Chat.AnyTool,
  Lenses extends Chat.AnyLens,
>(
  options: UiChatOptions<Tools, Lenses>,
) => {
  const { components: initialComponents, ...chatOptions } = options;
  const [components, setComponents] = useState(initialComponents);
  const [flattenedComponents] = useState(
    ɵui.flattenComponents(initialComponents),
  );
  const ui = useMemo(() => {
    return s.object('UI', {
      ui: s.streaming.array(
        'List of elements',
        ɵui.createComponentSchema(components),
      ),
    });
  }, [components]);
  const systemAsString = useMemo(() => {
    if (typeof chatOptions.system === 'string') {
      return chatOptions.system;
    }
    const output = chatOptions.system.compile(components, ui);
    if (chatOptions.system.diagnostics.length > 0) {
      throw new Error(
        `System prompt has ${chatOptions.system.diagnostics.length} errors: \n\n${chatOptions.system.diagnostics.map((d) => d.message).join('\n\n')}`,
      );
    }
    return output;
  }, [chatOptions.system, components, ui]);

  const chat = useStructuredChat({
    ...chatOptions,
    schema: ui as any,
    system: systemAsString,
  });

  const buildContent = useCallback(
    (
      nodes: string | Array<UiChatSchemaComponent>,
      parentKey = '',
    ): ReactElement[] | string => {
      if (typeof nodes === 'string') {
        return nodes;
      }

      const elements = nodes.map((element, index) => {
        const key = `${parentKey}_${index}`;

        const { $tag, $children, $props } = element;
        const componentType = flattenedComponents.get($tag)?.component;

        if ($tag && componentType) {
          const children: ReactNode[] | string | null = element.$children
            ? buildContent($children, key)
            : null;

          return createElement(componentType, {
            ...$props,
            children,
            key,
          });
        }

        throw new Error(`Unknown element type. ${$tag}`);
      });

      return elements;
    },
    [flattenedComponents],
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

  const lastAssistantMessage = useMemo(() => {
    return uiChatMessages.findLast((message) => message.role === 'assistant');
  }, [uiChatMessages]);

  return {
    ...chat,
    messages: uiChatMessages,
    setComponents,
    lastAssistantMessage,
  };
};
