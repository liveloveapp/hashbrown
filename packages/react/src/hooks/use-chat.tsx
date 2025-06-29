import {
  Chat,
  fryHashbrown,
  Hashbrown,
  KnownModelIds,
} from '@hashbrownai/core';
import { useCallback, useContext, useEffect, useState } from 'react';
import { useTools } from '../create-tool.fn';
import { HashbrownContext } from '../hashbrown-provider';

/**
 * Options for the `useChat` hook.
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
   * Reload the chat, useful for retrying when an error occurs.
   */
  reload: () => void;

  /**
   * The error encountered during chat operations, if any.
   */
  error: Error | null;

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
 * The result object contains functions and state enabling you to send and recieve messages and monitor the state of the chat.
 *
 * @description
 * The `useChat` hook provides the most basic functionality for un-structured chats.  Unstructured chats include things like general chats and natural language controls.
 *
 * @returns {UseChatResult} An object containing chat state and functions to interact with the chat.
 *
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
  const tools: Tools[] = useTools(options.tools ?? []);
  const config = useContext(HashbrownContext);

  const [hashbrown, setHashbrown] = useState<Hashbrown<string, Tools> | null>(
    null,
  );

  useEffect(() => {
    return () => {
      if (hashbrown) {
        hashbrown.teardown();
        setHashbrown(null);
      }
    };
  }, [hashbrown]);

  useEffect(() => {
    if (!config) {
      throw new Error('HashbrownContext not found');
    }

    const instance =
      hashbrown ??
      fryHashbrown<Tools>({
        apiUrl: config.url,
        middleware: config.middleware,
        debugName: options.debugName,
        model: options.model,
        system: options.system,
        tools,
        debounce: options.debounceTime,
        retries: options.retries,
      });

    if (!hashbrown) {
      setHashbrown(instance);
    } else {
      instance.updateOptions({
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
  }, [
    config,
    hashbrown,
    options.debounceTime,
    options.debugName,
    options.model,
    options.retries,
    options.system,
    tools,
  ]);

  const sendMessage = useCallback(
    (message: Chat.Message<string, Tools>) => {
      hashbrown?.sendMessage(message);
    },
    [hashbrown],
  );

  const setMessages = useCallback(
    (messages: Chat.Message<string, Tools>[]) => {
      hashbrown?.setMessages(messages);
    },
    [hashbrown],
  );

  const [internalMessages, setInternalMessages] = useState<
    Chat.Message<string, Tools>[]
  >(options.messages ?? []);
  const [isReceiving, setIsReceiving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isRunningToolCalls, setIsRunningToolCalls] = useState(false);
  const [exhaustedRetries, setExhaustedRetries] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    hashbrown?.observeMessages((messages) => {
      setInternalMessages(messages);
    });

    hashbrown?.observeIsReceiving((isReceiving) => {
      setIsReceiving(isReceiving);
    });

    hashbrown?.observeIsSending((isSending) => {
      setIsSending(isSending);
    });

    hashbrown?.observeIsRunningToolCalls((isRunningToolCalls) => {
      setIsRunningToolCalls(isRunningToolCalls);
    });

    hashbrown?.observeError((error) => {
      setError(error);
    });

    hashbrown?.observeExhaustedRetries((exhaustedRetries) => {
      setExhaustedRetries(exhaustedRetries);
    });
  }, [hashbrown]);

  const reload = useCallback(() => {
    const lastMessage = internalMessages[internalMessages.length - 1];

    if (lastMessage.role === 'assistant') {
      hashbrown?.setMessages(internalMessages.slice(0, -1));

      return true;
    }

    return false;
  }, [hashbrown, internalMessages]);

  return {
    messages: internalMessages,
    sendMessage,
    setMessages,
    reload,
    error,
    isReceiving,
    isSending,
    isRunningToolCalls,
    exhaustedRetries,
  };
}
