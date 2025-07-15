import {
  Chat,
  fryHashbrown,
  Hashbrown,
  KnownModelIds,
  s,
} from '@hashbrownai/core';
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { HashbrownContext } from '../hashbrown-provider';
import { useHashbrownSignal } from './use-hashbrown-signal';

/**
 * Options for the `useStructuredChat` hook.
 */
export interface UseStructuredChatOptions<
  Schema extends s.HashbrownType,
  Tools extends Chat.AnyTool,
  Output extends s.Infer<Schema> = s.Infer<Schema>,
> {
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
   * The schema to use for the chat.
   */
  schema: Schema;

  /**
   * The initial messages for the chat.
   * default: 1.0
   */
  messages?: Chat.Message<Output, Tools>[];
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
 * The result object-type returned by the `useStructuredChat` hook that provides functions and state for interacting with the chat.
 */
export interface UseStructuredChatResult<Output, Tools extends Chat.AnyTool> {
  /**
   * An array of chat messages.
   */
  messages: Chat.Message<Output, Tools>[];

  /**
   * Function to update the chat messages.
   * @param messages - The new array of chat messages.
   */
  setMessages: (messages: Chat.Message<Output, Tools>[]) => void;

  /**
   * Function to send a new chat message.
   * @param message - The chat message to send.
   */
  sendMessage: (message: Chat.Message<Output, Tools>) => void;

  /**
   * Function to cause current messages to be resent.  Can be used after an error in chat.
   */
  resendMessages: () => void;

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
}

/**
 * This React hook creates a chat instance used to interact with the LLM.
 * The result object contains functions and state enabling you to send and receive messages and monitor the state of the chat.
 *
 * @description
 * The `useStructuredChat` hook provides functionality for structured chats. Structured chats are used when you want to use the LLM to generate structured data according to a defined schema. This is particularly useful for:
 * - Generating typed data structures
 * - Creating form responses
 * - Building UI components
 * - Extracting information into a specific format
 *
 * @returns {UseStructuredChatResult} An object containing chat state and functions to interact with the chat.
 *
 * @example
 * In this example, the LLM will respond with a JSON object containing the translations of the input message into English, Spanish, and French.
 * ```tsx
 * const { messages, sendMessage } = useStructuredChat({
 *   model: 'gpt-4o',
 *   system: 'You are a helpful translator that provides accurate translations.',
 *   schema: s.object('Translations', {
 *     english: s.string('English translation'),
 *     spanish: s.string('Spanish translation'),
 *     french: s.string('French translation')
 *   }),
 * });
 * ```
 */
export function useStructuredChat<
  Schema extends s.HashbrownType,
  Tools extends Chat.AnyTool,
  Output extends s.Infer<Schema> = s.Infer<Schema>,
>(
  options: UseStructuredChatOptions<Schema, Tools, Output>,
): UseStructuredChatResult<Output, Tools> {
  const config = useContext(HashbrownContext);

  if (!config) {
    throw new Error('HashbrownContext not found');
  }

  const tools: Tools[] = useMemo(
    () => options.tools ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    options.tools ?? [],
  );

  const [schema] = useState<Schema>(options.schema);
  const hashbrown = useRef<Hashbrown<Output, Tools> | null>(null);

  if (!hashbrown.current) {
    hashbrown.current = fryHashbrown<Schema, Tools, Output>({
      apiUrl: config.url,
      middleware: config.middleware,
      model: options.model,
      system: options.system,
      responseSchema: schema,
      tools,
      debugName: options.debugName,
      debounce: options.debounceTime,
      retries: options.retries,
    });
  }

  function getHashbrown() {
    const instance = hashbrown.current;

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
      model: options.model,
      system: options.system,
      responseSchema: schema,
      tools,
      debugName: options.debugName,
      debounce: options.debounceTime,
      retries: options.retries,
    });
  }, [
    config.url,
    config.middleware,
    options.model,
    options.system,
    options.debugName,
    schema,
    tools,
    options.debounceTime,
    options.retries,
  ]);

  const internalMessages = useHashbrownSignal(hashbrown.current.messages);
  const isReceiving = useHashbrownSignal(hashbrown.current.isReceiving);
  const isSending = useHashbrownSignal(hashbrown.current.isSending);
  const isRunningToolCalls = useHashbrownSignal(
    hashbrown.current.isRunningToolCalls,
  );
  const exhaustedRetries = useHashbrownSignal(
    hashbrown.current.exhaustedRetries,
  );
  const error = useHashbrownSignal(hashbrown.current.error);

  const sendMessage = useCallback((message: Chat.Message<Output, Tools>) => {
    getHashbrown().sendMessage(message);
  }, []);

  const stop = useCallback((clearStreamingMessage = false) => {
    getHashbrown().stop(clearStreamingMessage);
  }, []);

  const resendMessages = useCallback(() => {
    getHashbrown().resendMessages();
  }, []);

  const setMessages = useCallback((messages: Chat.Message<Output, Tools>[]) => {
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

  return {
    messages: internalMessages,
    stop,
    sendMessage,
    resendMessages,
    setMessages,
    reload,
    error,
    isReceiving,
    isSending,
    isRunningToolCalls,
    exhaustedRetries,
  };
}
