import { Chat, fryHashbrown, Hashbrown, s } from '@hashbrownai/core';
import { useCallback, useContext, useEffect, useState } from 'react';
import { useTools } from '../create-tool.fn';
import { HashbrownContext } from '../hashbrown-provider';

/**
 * Options for the `useChat` hook.
 */
export interface UseStructuredChatOptions<
  Schema extends s.HashbrownType,
  Tools extends Chat.AnyTool,
> {
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
   * The schema to use for the chat.
   */
  schema: Schema;

  /**
   * The initial messages for the chat.
   * default: 1.0
   */
  messages?: Chat.Message<Schema, Tools>[];
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
export interface UseStructuredChatResult<
  Schema extends s.HashbrownType,
  Tools extends Chat.AnyTool,
> {
  /**
   * An array of chat messages.
   */
  messages: Chat.Message<Schema, Tools>[];

  /**
   * Function to update the chat messages.
   * @param messages - The new array of chat messages.
   */
  setMessages: (messages: Chat.Message<Schema, Tools>[]) => void;

  /**
   * Function to send a new chat message.
   * @param message - The chat message to send.
   */
  sendMessage: (message: Chat.Message<Schema, Tools>) => void;

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
 * @param {UseStructuredChatOptions} options - Configuration options for the chat.
 * @returns {UseStructuredChatResult} An object containing chat state and functions to interact with the chat.
 *
 * @example
 * ```tsx
 * const MyChatComponent = () => {
 *   const { messages, sendMessage, status } = useStructuredChat({
 *     model: 'gpt-4o',
 *     prompt: 'You are a helpful assistant.',
 *     schema: s.object('Person', {
 *       name: s.string('Name of the person'),
 *       age: s.number('Age of the person'),
 *     }),
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
export function useStructuredChat<
  Schema extends s.HashbrownType,
  Tools extends Chat.AnyTool,
>(
  options: UseStructuredChatOptions<Schema, Tools>,
): UseStructuredChatResult<Schema, Tools> {
  const tools: Tools[] = useTools(options.tools ?? []);
  const config = useContext(HashbrownContext);

  const [hashbrown, setHashbrown] = useState<Hashbrown<Schema, Tools> | null>(
    null,
  );

  const [schema] = useState<Schema>(options.schema);

  useEffect(() => {
    if (!config) {
      throw new Error('HashbrownContext not found');
    }

    const instance = fryHashbrown<Schema, Tools>({
      apiUrl: config.url,
      model: options.model,
      prompt: options.prompt,
      responseSchema: schema,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      tools,
      debugName: options.debugName,
    });

    setHashbrown(instance);

    return () => {
      instance.teardown();
      setHashbrown(null);
    };
  }, [
    config,
    options.model,
    options.prompt,
    options.temperature,
    options.maxTokens,
    options.debugName,
    schema,
    tools,
  ]);

  const sendMessage = useCallback(
    (message: Chat.Message<Schema, Tools>) => {
      hashbrown?.sendMessage(message);
    },
    [hashbrown],
  );

  const setMessages = useCallback(
    (messages: Chat.Message<Schema, Tools>[]) => {
      hashbrown?.setMessages(messages);
    },
    [hashbrown],
  );

  const [internalMessages, setInternalMessages] = useState<
    Chat.Message<Schema, Tools>[]
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
