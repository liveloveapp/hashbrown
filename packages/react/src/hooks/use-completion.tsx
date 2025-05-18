import { Chat } from '@hashbrownai/core';
import { useEffect, useMemo } from 'react';
import { useChat } from './use-chat';

/**
 * Options for the `useCompletion` hook.
 */
export interface UseCompletionOptions<Tools extends Chat.AnyTool> {
  /**
   * The input string to predict from.
   */
  input: string | null | undefined;

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
 * The result of the `useCompletion` hook.
 */
export interface UseCompletionResult {
  output: string | null;

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

export const useCompletion = <Tools extends Chat.AnyTool>(
  options: UseCompletionOptions<Tools>,
): UseCompletionResult => {
  const { setMessages, ...chat } = useChat({
    ...options,
  });

  useEffect(() => {
    if (!options.input) return;

    setMessages([{ role: 'user', content: options.input }]);
  }, [setMessages, options.input]);

  const output: string | null = useMemo(() => {
    const message = chat.messages.find(
      (message) =>
        message.role === 'assistant' &&
        !(message.toolCalls && message.toolCalls.length) &&
        message.content,
    );

    if (!message) return null;
    if (typeof message.content !== 'string') return null;

    return message.content;
  }, [chat.messages]);

  return {
    output,
    reload: chat.reload,
    error: chat.error,
    isReceiving: chat.isReceiving,
    isSending: chat.isSending,
    isRunningToolCalls: chat.isRunningToolCalls,
  };
};
