import { Chat, KnownModelIds } from '@hashbrownai/core';
import { useEffect, useMemo } from 'react';
import { useChat } from './use-chat';

/**
 * Options for the `useCompletion` hook.
 */
export interface UseCompletionOptions<Input> {
  /**
   * The input string to predict from.
   */
  input: Input | null | undefined;

  /**
   * The LLM model to use for the chat.
   *
   */
  model: KnownModelIds;

  /**
   * The system message to use for the completion.
   */
  system: string;

  /**
   * The tools to make available use for the completion.
   * default: []
   */
  tools?: Chat.AnyTool[];

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
   * Number of retries if an error is received.
   * default: 0
   */
  retries?: number;
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

  /**
   * Whether the current request has exhausted retries.
   */
  exhaustedRetries: boolean;
}

/**
 * This React hook creates a change instance used to interact with the LLM.
 * The result object contains functions and state enabling you to send and recieve messages and monitor the state of the chat.
 *
 * @description
 * The `useCompletion` hook provides functionality for completing unstructured inputs with predicted unstructured outputs.  This is useful for things like natural language autocompletions.
 *
 * @example
 * ```ts
 * const { output } = useCompletion({
 *   model: 'gpt-4o-mini',
 *   input: firstName,
 *   system: `Help the user generate a last name for the given first name.`,
 * });
 * ```
 */
export function useCompletion<Input>(
  /**
   * The options to configure the completion chat.
   */
  options: UseCompletionOptions<Input>,
): UseCompletionResult {
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
    exhaustedRetries: chat.exhaustedRetries,
  };
}
