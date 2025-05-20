import { Chat, fryHashbrown, Hashbrown } from '@hashbrownai/core';
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
  model: string;

  /**
   * The prompt to use for the chat.
   */
  prompt: string;

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

/**
 * Represents the result of the `useChat` hook.
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
}

/**
 * Custom React hook to manage chat interactions within a HashbrownProvider context.
 * This hook provides functionalities to send messages, handle tool calls, and manage chat status.
 *
 * @param {UseChatOptions} options - Configuration options for the chat.
 * @returns {UseChatResult} An object containing chat state and functions to interact with the chat.
 *
 * @example
 * ```tsx
 * const MyChatComponent = () => {
 *   const { messages, sendMessage, status } = useChat({
 *     model: 'gpt-4o',
 *     prompt: 'You are a helpful assistant.',
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
  options: UseChatOptions<Tools>,
): UseChatResult<Tools> {
  const tools: Tools[] = useTools(options.tools ?? []);
  const config = useContext(HashbrownContext);

  const [hashbrown, setHashbrown] = useState<Hashbrown<string, Tools> | null>(
    null,
  );

  useEffect(() => {
    if (!config) {
      throw new Error('HashbrownContext not found');
    }

    console.log('frying hashbrown');

    const instance = fryHashbrown<Tools>({
      apiUrl: config.url,
      middleware: config.middleware,
      debugName: options.debugName,
      maxTokens: options.maxTokens,
      model: options.model,
      prompt: options.prompt,
      temperature: options.temperature,
      tools,
    });

    setHashbrown(instance);

    return () => {
      instance.teardown();
      setHashbrown(null);
    };
  }, [
    config,
    options.debugName,
    options.maxTokens,
    options.model,
    options.prompt,
    options.temperature,
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
  };
}
