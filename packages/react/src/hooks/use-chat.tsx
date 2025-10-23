import {
  type Chat,
  fryHashbrown,
  Hashbrown,
  type KnownModelIds,
} from '@hashbrownai/core';
import { useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { HashbrownContext } from '../hashbrown-provider';
import { useHashbrownSignal } from './use-hashbrown-signal';

/**
 * Options for the `useChat` hook.
 *
 * @public
 * @typeParam Tools - The set of tool definitions available to the chat.
 */
export interface UseChatOptions<Tools extends Chat.AnyTool> {
  /**
   * The LLM model to use for the chat.
   *
   */
  model: KnownModelIds;

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
}

/**
 * The result object-type returned by the `useChat` hook that provides functions and state for interacting with the chat.
 *
 * @public
 * @typeParam Tools - The set of tool definitions available to the chat.
 */
export interface UseChatResult<Tools extends Chat.AnyTool> {
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
   * Whether the chat is running tool calls.
   */
  isRunningToolCalls: boolean;

  /**
   * Whether the current request has exhausted retries.
   */
  exhaustedRetries: boolean;

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
 * @example
 * This example demonstrates how to use the `useChat` hook to create a simple chat component.
 *
 * ```tsx
 * const MyChatComponent = () => {
 *   const { messages, sendMessage, status } = useChat({
 *     model: 'gpt-4o',
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
export function useChat<Tools extends Chat.AnyTool>(
  /**
   * The options for the chat.
   */
  options: UseChatOptions<Tools>,
): UseChatResult<Tools> {
  const tools: Tools[] = useMemo(
    () => options.tools ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    options.tools ?? [],
  );
  const config = useContext(HashbrownContext);

  if (!config) {
    throw new Error('HashbrownContext not found');
  }

  const hashbrownRef = useRef<Hashbrown<string, Tools> | null>(null);

  if (!hashbrownRef.current) {
    hashbrownRef.current = fryHashbrown<Tools>({
      apiUrl: config.url,
      middleware: config.middleware,
      debugName: options.debugName,
      model: options.model,
      system: options.system,
      tools,
      debounce: options.debounceTime,
      retries: options.retries,
    });
  }

  function getHashbrown() {
    const instance = hashbrownRef.current;

    if (!instance) {
      throw new Error('Hashbrown not found');
    }

    return instance;
  }

  useEffect(() => {
    return getHashbrown().sizzle();
  }, []);

  useEffect(() => {
    getHashbrown().updateOptions({
      apiUrl: config.url,
      middleware: config.middleware,
      debugName: options.debugName,
      model: options.model,
      system: options.system,
      tools,
      debounce: options.debounceTime,
      retries: options.retries,
    });
  }, [
    config.url,
    config.middleware,
    options.debounceTime,
    options.debugName,
    options.model,
    options.retries,
    options.system,
    tools,
  ]);

  const internalMessages = useHashbrownSignal<Chat.Message<string, Tools>[]>(
    getHashbrown().messages,
  );
  const isReceiving = useHashbrownSignal<boolean>(getHashbrown().isReceiving);
  const isSending = useHashbrownSignal<boolean>(getHashbrown().isSending);
  const isRunningToolCalls = useHashbrownSignal<boolean>(
    getHashbrown().isRunningToolCalls,
  );
  const exhaustedRetries = useHashbrownSignal<boolean>(
    getHashbrown().exhaustedRetries,
  );
  const error = useHashbrownSignal<Error | undefined>(getHashbrown().error);
  const lastAssistantMessage = useHashbrownSignal<
    Chat.AssistantMessage<string, Tools> | undefined
  >(getHashbrown().lastAssistantMessage);

  const sendMessage = useCallback((message: Chat.Message<string, Tools>) => {
    getHashbrown().sendMessage(message);
  }, []);

  const setMessages = useCallback((messages: Chat.Message<string, Tools>[]) => {
    getHashbrown().setMessages(messages);
  }, []);

  const reload = useCallback(() => {
    const lastMessage = internalMessages[internalMessages.length - 1];

    if (lastMessage.role === 'assistant') {
      getHashbrown().setMessages(internalMessages.slice(0, -1));

      return true;
    }

    return false;
  }, [internalMessages]);

  const stop = useCallback((clearStreamingMessage = false) => {
    getHashbrown().stop(clearStreamingMessage);
  }, []);

  return {
    messages: internalMessages,
    sendMessage,
    setMessages,
    stop,
    reload,
    error,
    isReceiving,
    isSending,
    isRunningToolCalls,
    exhaustedRetries,
    lastAssistantMessage,
  };
}
