import {
  type Chat,
  type ChatRuntime,
  createChatRuntime,
  type TransportOrFactory,
} from '@hashbrownai/core';
import { useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { HashbrownContext } from '../hashbrown-provider';
import { useHashbrownSignal } from './use-hashbrown-signal';

/**
 * Options for the `useChat` hook.
 *
 * @public
 * @typeParam Tools - The set of tool definitions available to the chat.
 * @typeParam State - The shared agent state owned by the runtime.
 */
export interface UseChatOptions<Tools extends Chat.AnyTool, State = unknown> {
  /**
   * The system message to use for the chat.
   */
  system: string;

  /**
   * The initial messages for the chat.
   * default: 1.0
   */
  messages?: Chat.Message<string, Tools>[];

  /**
   * The initial shared agent state.
   */
  state?: State;
  /**
   * The tools to make available use for the chat.
   * default: []
   */
  tools?: Tools[];

  /**
   * The debounce time between sends to the endpoint.
   * default: 150
   */
  debounceTime?: number;

  /**
   * Number of retries if an error is received.
   * default: 0
   */
  retries?: number;

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
 * The result object-type returned by the `useChat` hook that provides functions and state for interacting with the chat.
 *
 * @public
 * @typeParam Tools - The set of tool definitions available to the chat.
 * @typeParam State - The shared agent state owned by the runtime.
 */
export interface UseChatResult<Tools extends Chat.AnyTool, State = unknown> {
  /**
   * The currently visible shared agent state.
   */
  readonly state: State | undefined;

  /**
   * Replaces the shared agent state without starting a generation.
   * @param state - The next shared agent state.
   */
  setState(state: State): void;

  /**
   * An array of chat messages.
   */
  messages: Chat.Message<string, Tools>[];

  /**
   * Function to update the chat messages.
   * @param messages - The new array of chat messages.
   */
  setMessages: (messages: Chat.Message<string, Tools>[]) => void;

  /**
   * Function to send a new chat message.
   * @param message - The chat message to send.
   */
  sendMessage: (message: Chat.Message<string, Tools>) => void;

  /**
   * Function to stop the chat.
   */
  stop: (clearStreamingMessage?: boolean) => void;

  /**
   * Reload the chat, useful for retrying when an error occurs.
   */
  reload: () => void;

  /**
   * The error encountered during chat operations, if any.
   */
  error: Error | undefined;

  /**
   * Whether the chat is receiving a response.
   */
  isReceiving: boolean;

  /**
   * Whether the chat is sending a response.
   */
  isSending: boolean;

  /**
   * Whether the chat is currently generating (between start and finish/error events).
   */
  isGenerating: boolean;

  /**
   * Whether the chat is running tool calls.
   */
  isRunningToolCalls: boolean;

  /**
   * Aggregate loading flag across transport, generation, and tool calls.
   */
  isLoading: boolean;

  /**
   * Whether the current request has exhausted retries.
   */
  exhaustedRetries: boolean;

  /**
   * Transport/request failure before generation events arrive.
   */
  sendingError: Error | undefined;

  /**
   * Error emitted during generation events.
   */
  generatingError: Error | undefined;

  /**
   * The last assistant message.
   */
  lastAssistantMessage: Chat.AssistantMessage<string, Tools> | undefined;
}

/**
 * This React hook creates a chat instance used to interact with the LLM.
 * The result object contains functions and state enabling you to send and recieve messages and monitor the state of the chat.
 *
 * The `useChat` hook provides the most basic functionality for un-structured chats.  Unstructured chats include things like general chats and natural language controls.
 *
 * @public
 * @returns An object containing chat state and functions to interact with the chat.
 * @typeParam Tools - The set of tool definitions available to the chat.
 * @typeParam State - The shared agent state owned by the runtime.
 * @example
 * This example demonstrates how to use the `useChat` hook to create a simple chat component.
 *
 * ```tsx
 * const MyChatComponent = () => {
 *   const { messages, sendMessage, status } = useChat({
 *     system: 'You are a helpful assistant.',
 *     tools: [],
 *   });
 *
 *   const handleSendMessage = () => {
 *     sendMessage({ role: 'user', content: 'Hello, how are you?' });
 *   };
 *
 *   return (
 *     <div>
 *       <button onClick={handleSendMessage}>Send Message</button>
 *       <div>Status: {status}</div>
 *       <ul>
 *         {messages.map((msg, index) => (
 *           <li key={index}>{msg.content}</li>
 *         ))}
 *       </ul>
 *     </div>
 *   );
 * };
 * ```
 */
export function useChat<Tools extends Chat.AnyTool, State = unknown>(
  /**
   * The options for the chat.
   */
  options: UseChatOptions<Tools, State>,
): UseChatResult<Tools, State> {
  const tools: Tools[] = useMemo(
    () => options.tools ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    options.tools ?? [],
  );
  const config = useContext(HashbrownContext);

  if (!config) {
    throw new Error('HashbrownContext not found');
  }

  const hasThreadId = Object.hasOwn(options, 'threadId');
  const runtimeRef = useRef<ChatRuntime<string, Tools, State> | null>(null);

  if (!runtimeRef.current) {
    runtimeRef.current = createChatRuntime<Tools, State>({
      debugName: options.debugName,
      system: options.system,
      messages: [...(options.messages ?? [])],
      state: options.state,
      tools,
      debounce: options.debounceTime,
      retries: options.retries,
      transport: options.transport ?? config.transport,
      ui: false,
      threadId: options.threadId,
    });
  }

  function getRuntime() {
    const instance = runtimeRef.current;

    if (!instance) {
      throw new Error('Chat runtime not found');
    }

    return instance;
  }

  useEffect(() => {
    return getRuntime().start();
  }, []);

  useEffect(() => {
    getRuntime().updateOptions({
      debugName: options.debugName,
      system: options.system,
      tools,
      debounce: options.debounceTime,
      retries: options.retries,
      transport: options.transport ?? config.transport,
      ui: false,
      ...(hasThreadId ? { threadId: options.threadId } : {}),
    });
  }, [
    config.transport,
    options.debounceTime,
    options.debugName,
    options.retries,
    options.system,
    options.transport,
    hasThreadId,
    options.threadId,
    tools,
  ]);

  const internalMessages = useHashbrownSignal<Chat.Message<string, Tools>[]>(
    getRuntime().messages,
  );
  const state = useHashbrownSignal<State | undefined>(getRuntime().state);
  const isReceiving = useHashbrownSignal<boolean>(getRuntime().isReceiving);
  const isSending = useHashbrownSignal<boolean>(getRuntime().isSending);
  const isGenerating = useHashbrownSignal<boolean>(getRuntime().isGenerating);
  const isRunningToolCalls = useHashbrownSignal<boolean>(
    getRuntime().isRunningToolCalls,
  );
  const isLoading = useHashbrownSignal<boolean>(getRuntime().isLoading);
  const exhaustedRetries = useHashbrownSignal<boolean>(
    getRuntime().exhaustedRetries,
  );
  const error = useHashbrownSignal<Error | undefined>(getRuntime().error);
  const sendingError = useHashbrownSignal<Error | undefined>(
    getRuntime().sendingError,
  );
  const generatingError = useHashbrownSignal<Error | undefined>(
    getRuntime().generatingError,
  );
  const lastAssistantMessage = useHashbrownSignal<
    Chat.AssistantMessage<string, Tools> | undefined
  >(getRuntime().lastAssistantMessage);
  const sendMessage = useCallback((message: Chat.Message<string, Tools>) => {
    getRuntime().sendMessage(message);
  }, []);

  const setMessages = useCallback((messages: Chat.Message<string, Tools>[]) => {
    getRuntime().setMessages(messages);
  }, []);

  const setState = useCallback((state: State) => {
    getRuntime().setState(state);
  }, []);

  const reload = useCallback(() => {
    const lastMessage = internalMessages[internalMessages.length - 1];

    if (lastMessage.role === 'assistant') {
      getRuntime().setMessages(internalMessages.slice(0, -1));

      return true;
    }

    return false;
  }, [internalMessages]);

  const stop = useCallback((clearStreamingMessage = false) => {
    getRuntime().stop(clearStreamingMessage);
  }, []);

  return {
    state,
    setState,
    messages: internalMessages,
    sendMessage,
    setMessages,
    stop,
    reload,
    error,
    isGenerating,
    isReceiving,
    isSending,
    isRunningToolCalls,
    isLoading,
    exhaustedRetries,
    sendingError,
    generatingError,
    lastAssistantMessage,
  };
}
