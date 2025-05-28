import { Chat, s } from '@hashbrownai/core';
import { useEffect, useMemo } from 'react';
import { useStructuredChat } from './use-structured-chat';

export interface UseStructuredCompletionOptions<
  Schema extends s.HashbrownType,
  Tools extends Chat.AnyTool,
> {
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
   * The system message to use for the chat.
   */
  system: string;

  /**
   * The schema to use for the chat.
   */
  schema: Schema;

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
   * The name of the hook, useful for debugging.
   */
  debugName?: string;
}

/**
 * The result of the `useStructuredCompletion` hook.
 */
export interface UseStructuredCompletionResult<Output> {
  /**
   * The output of the chat.
   */
  output: Output | null;

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

export const useStructuredCompletion = <
  Schema extends s.HashbrownType,
  Tools extends Chat.AnyTool,
>(
  options: UseStructuredCompletionOptions<Schema, Tools>,
): UseStructuredCompletionResult<s.Infer<Schema>> => {
  const { setMessages, ...chat } = useStructuredChat({
    ...options,
  });

  useEffect(() => {
    if (!options.input) return;

    setMessages([{ role: 'user', content: options.input }]);
  }, [setMessages, options.input]);

  const output: s.Infer<Schema> | null = useMemo(() => {
    const message = chat.messages.find(
      (message) => message.role === 'assistant' && message.content,
    );

    if (!message) return null;

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
