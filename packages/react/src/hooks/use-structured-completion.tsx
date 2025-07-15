import { Chat, KnownModelIds, s } from '@hashbrownai/core';
import { useEffect, useMemo } from 'react';
import { useStructuredChat } from './use-structured-chat';

/**
 * Options for the `useStructuredCompletion` hook.
 */
export interface UseStructuredCompletionOptions<
  Input,
  Schema extends s.HashbrownType,
> {
  /**
   * The input string to predict from.
   */
  input: Input | null | undefined;

  /**
   * The LLM model to use for the chat.
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
   * The tools to make available for the chat.
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
 * The result object-type returned by the `useStructuredCompletion` hook that provides the structured output and state for the completion.
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
 * This React hook creates a completion instance that predicts structured data based on input context.
 * The result object contains the predicted structured output and state for monitoring the completion.
 *
 * @description
 * The `useStructuredCompletion` hook provides functionality for predicting structured data based on input context. This is particularly useful for:
 * - Smart form field suggestions
 * - Context-aware recommendations
 * - Predictive UI generation
 * - Intelligent defaults
 *
 * @returns {UseStructuredCompletionResult} An object containing the predicted structured output and completion state.
 *
 * @example
 * In this example, the LLM will predict a color palette based on a given theme or mood.
 * ```tsx
 * const { output } = useStructuredCompletion({
 *   model: 'gpt-4o',
 *   system: `Predict a color palette based on the given mood or theme. For example,
 *   if the theme is "Calm Ocean", suggest appropriate colors.`,
 *   input: theme,
 *   schema: s.object('Color Palette', {
 *     colors: s.array(
 *       'The colors in the palette',
 *       s.string('Hex color code')
 *     )
 *   })
 * });
 * ```
 */
export function useStructuredCompletion<Input, Schema extends s.HashbrownType>(
  options: UseStructuredCompletionOptions<Input, Schema>,
): UseStructuredCompletionResult<s.Infer<Schema>> {
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
    exhaustedRetries: chat.exhaustedRetries,
  };
}
