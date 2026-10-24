import { Chat, s } from '@hashbrownai/core';
import { useMemo } from 'react';
import { useCompletionInput } from './use-completion-input';
import { useStructuredChat } from './use-structured-chat';
import type {
  UseStructuredCompletionOptions,
  UseStructuredCompletionResult,
} from './use-structured-completion';

/**
 * Runs a structured completion and also returns the assistant message its
 * output comes from, so a wrapper such as `useUiCompletion` can expose that
 * message's canonical id.
 *
 * @internal
 * @param options - The options for the structured completion.
 * @returns The completion result and the assistant message behind its
 * output, or `null` when there is no output yet.
 */
export function useStructuredCompletionWithMessage<
  Input,
  Schema extends s.SchemaOutput,
  State = unknown,
>(
  options: UseStructuredCompletionOptions<Input, Schema, State>,
): {
  readonly result: UseStructuredCompletionResult<
    s.InferSchemaOutput<Schema>,
    State
  >;
  readonly message: Chat.AssistantMessage<
    s.InferSchemaOutput<Schema>,
    Chat.AnyTool
  > | null;
} {
  const { setMessages, ...chat } = useStructuredChat<
    Schema,
    Chat.AnyTool,
    s.InferSchemaOutput<Schema>,
    State
  >({
    ...options,
    ui: options.ui ?? false,
  });

  useCompletionInput(options.input, chat.resume, setMessages);

  const message = useMemo(
    () =>
      chat.messages.find(
        (
          message,
        ): message is Chat.AssistantMessage<
          s.InferSchemaOutput<Schema>,
          Chat.AnyTool
        > =>
          message.role === 'assistant' &&
          message.content !== null &&
          message.content !== undefined,
      ) ?? null,
    [chat.messages],
  );
  const output: s.InferSchemaOutput<Schema> | null = message?.content ?? null;

  const result: UseStructuredCompletionResult<
    s.InferSchemaOutput<Schema>,
    State
  > = {
    pendingInterrupts: chat.pendingInterrupts,
    isResuming: chat.isResuming,
    resume: chat.resume,
    recovery: chat.recovery,
    restoreConversation: chat.restoreConversation,
    getRecoveryConfiguration: chat.getRecoveryConfiguration,
    stop: chat.stop,
    state: chat.state,
    setState: chat.setState,
    output,
    reload: chat.reload,
    error: chat.error,
    isLoading: chat.isLoading,
    isReceiving: chat.isReceiving,
    isSending: chat.isSending,
    isGenerating: chat.isGenerating,
    isRunningToolCalls: chat.isRunningToolCalls,
    sendingError: chat.sendingError,
    generatingError: chat.generatingError,
    exhaustedRetries: chat.exhaustedRetries,
    lastRunResult: chat.lastRunResult,
    lastRunUsage: chat.lastRunUsage,
    lastRunFinishReason: chat.lastRunFinishReason,
  };

  return { result, message };
}
