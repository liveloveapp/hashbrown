/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Chat,
  type ComponentNode,
  type TransportOrFactory,
  type UiWrapper,
  ɵmergeOfferedComponents,
  ɵreportMilestone,
  ɵsetRequestResponseSchema,
} from '@hashbrownai/core';
import {
  type Dispatch,
  ReactElement,
  type SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ExposedComponent } from '../expose-component.fn';
import { HashbrownContext } from '../hashbrown-provider';
import {
  useStructuredChat,
  type UseStructuredChatResult,
} from './use-structured-chat';
import { type UiKitInput, useUiKit } from './use-ui-kit';

/**
 * Represents a UI component in the chat schema with its properties and children.
 *
 * @public
 */
export type UiChatSchemaComponent = ComponentNode;

/**
 * The schema for UI components in the chat.
 *
 * @public
 */
export type UiChatSchema = UiWrapper;

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
    ui: ReactElement<any>[] | null;
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
 * Can be an assistant message with UI components, a user message, an error
 * message, or an AG-UI activity message.
 *
 * @public
 * @typeParam Tools - The set of tool definitions available to the chat.
 */
export type UiChatMessage<Tools extends Chat.AnyTool> =
  | UiAssistantMessage<Tools>
  | UiErrorMessage
  | UiUserMessage
  | Chat.ActivityMessage;

/**
 * Chat state and commands with rendered UI messages.
 * @public
 * @typeParam Tools - The tools available to the chat.
 * @typeParam State - The shared agent state owned by the runtime.
 */
export interface UiChatResult<
  Tools extends Chat.AnyTool,
  State = unknown,
> extends Omit<
  UseStructuredChatResult<UiChatSchema, Tools, State>,
  'messages' | 'lastAssistantMessage'
> {
  /** The messages with rendered UI attached to assistant responses. */
  messages: UiChatMessage<Tools>[];
  /**
   * The components offered to the model on the next request: the
   * `components` option until `setComponents` replaces them.
   */
  readonly components: UiKitInput<ExposedComponent<any>>[];
  /**
   * Replace the components offered to the model on the next request.
   *
   * The chat keeps every component it has ever offered, one per name, with
   * the newest definition of a name replacing older ones. Messages render
   * with that set, so earlier answers still render after the list narrows,
   * and new responses are parsed against it too: a provider that does not
   * enforce the response schema strictly can still render a component that
   * was removed.
   */
  setComponents: Dispatch<SetStateAction<UiKitInput<ExposedComponent<any>>[]>>;
  /** The most recent assistant response, including its rendered UI. */
  lastAssistantMessage: UiAssistantMessage<Tools> | undefined;
}

/**
 * Options for the `useUiChat` hook.
 *
 * @public
 * @typeParam Tools - The set of tool definitions available to the chat.
 * @typeParam State - The shared agent state owned by the runtime.
 */
export interface UiChatOptions<Tools extends Chat.AnyTool, State = unknown> {
  /**
   * The system message to use for the chat.
   */
  system: string;

  /**
   * The components that can be rendered by the chat.
   */
  components: UiKitInput<ExposedComponent<any>>[];

  /**
   * The initial messages for the chat.
   * default: []
   */
  messages?: Chat.MessageInput<UiChatSchema, Tools>[];

  /**
   * The initial shared agent state.
   */
  state?: State;

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

  /**
   * Optional transport override for this hook.
   */
  transport?: TransportOrFactory;

  /**
   * Optional opaque AG-UI thread identity.
   */
  threadId?: string | undefined;
}

/**
 * This React hook creates a chat instance that can generate and render UI components.
 * The result object contains functions and state enabling you to send and receive messages and monitor the state of the chat.
 *
 * @public
 * @typeParam Tools - The set of tool definitions available to the chat.
 * @typeParam State - The shared agent state owned by the runtime.
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
export const useUiChat = <Tools extends Chat.AnyTool, State = unknown>(
  options: UiChatOptions<Tools, State>,
): UiChatResult<Tools, State> => {
  const { components: initialComponents, ...chatOptions } = options;
  const [components, setComponents] = useState(initialComponents);
  // Every component the chat has offered, one per name, the newest
  // definition winning. Responses and history are parsed and rendered with
  // these, so an earlier answer keeps rendering after `setComponents` removes
  // its component.
  const [offered, setOffered] = useState(() => ({
    source: initialComponents,
    components: ɵmergeOfferedComponents<ExposedComponent<any>>(
      initialComponents,
      [],
    ),
  }));
  const current =
    offered.source === components
      ? offered
      : {
          source: components,
          components: ɵmergeOfferedComponents<ExposedComponent<any>>(
            components,
            offered.components,
          ),
        };
  if (current !== offered) {
    setOffered(current);
  }
  const uiKit = useUiKit<ExposedComponent<any>>({
    components: current.components,
  });
  const requestKit = useUiKit<ExposedComponent<any>>({ components });
  const ui = useMemo(() => uiKit.schema, [uiKit.serializedSchema]);
  const chat = useStructuredChat<typeof ui, Tools, UiChatSchema, State>({
    ...chatOptions,
    schema: ui as any,
    ui: true,
  });

  // The model is offered only the current components.
  const narrowed = requestKit.serializedSchema !== uiKit.serializedSchema;
  const requestSchemaSet = useRef(false);
  useEffect(() => {
    if (!narrowed && !requestSchemaSet.current) return;
    requestSchemaSet.current = narrowed;
    ɵsetRequestResponseSchema(chat, narrowed ? requestKit.schema : undefined);
  }, [chat.resume, narrowed, requestKit.serializedSchema]);

  const buildContent = useCallback(
    (content: string | UiChatSchema): ReactElement<any>[] | string => {
      if (typeof content === 'string') {
        return content;
      }
      return uiKit.render(content);
    },
    [uiKit],
  );

  const uiChatMessages = useMemo(() => {
    return chat.messages.map((message): UiChatMessage<Tools> => {
      if (message.role === 'assistant') {
        return {
          ...message,
          ui: message.content ? buildContent(message.content) : null,
        } as UiAssistantMessage<Tools>;
      }

      // User, error and activity messages pass through as is; activities are
      // rendered by the app, not parsed as UI.
      return message;
    });
  }, [buildContent, chat.messages]);

  const lastAssistantMessage = useMemo(() => {
    return uiChatMessages.findLast((message) => message.role === 'assistant');
  }, [uiChatMessages]);

  const collector = useContext(HashbrownContext)?.collector;
  const renderedComponent = uiChatMessages.some(
    (message) =>
      message.role === 'assistant' &&
      Array.isArray(message.ui) &&
      message.ui.length > 0,
  );
  useEffect(() => {
    if (renderedComponent && collector) {
      ɵreportMilestone(collector, 'component.first_rendered');
    }
  }, [renderedComponent, collector]);

  return {
    ...chat,
    messages: uiChatMessages,
    components,
    setComponents,
    lastAssistantMessage,
  };
};
