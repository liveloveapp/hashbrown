/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, Signal } from '@angular/core';
import { Chat, s } from '@hashbrownai/core';
import { connectCompletionInput } from './completion-input.fn';
import { structuredChatResource } from './structured-chat-resource.fn';
import { toDeepSignal } from '../utils/deep-signal';
import { createResourceSnapshot } from './create-resource-snapshot.fn';
import type {
  StructuredCompletionResourceOptions,
  StructuredCompletionResourceRef,
} from './structured-completion-resource.fn';

/**
 * Creates a structured completion resource together with the assistant
 * message its value comes from, so a wrapper such as `uiCompletionResource`
 * can expose that message's canonical id.
 *
 * @internal
 * @param options - The options for the structured completion resource.
 * @returns The resource and the assistant message behind its value, or
 * `null` when there is no value yet.
 */
export function structuredCompletionResourceWithMessage<
  Input,
  Schema extends s.SchemaOutput,
  Output extends s.InferSchemaOutput<Schema> = s.InferSchemaOutput<Schema>,
  State = unknown,
>(
  options: StructuredCompletionResourceOptions<Input, Schema, State>,
): {
  readonly ref: StructuredCompletionResourceRef<Output, State>;
  readonly message: Signal<Chat.AssistantMessage<Output, Chat.AnyTool> | null>;
} {
  const { input, schema, system, tools, debugName, apiUrl, retries, debounce } =
    options;

  const resource = structuredChatResource<Schema, Chat.AnyTool, Output, State>({
    system,
    state: options.state,
    schema,
    tools,
    debugName,
    apiUrl,
    retries,
    debounce,
    transport: options.transport,
    ui: options.ui ?? false,
    ...(Object.hasOwn(options, 'threadId')
      ? { threadId: options.threadId }
      : {}),
  });

  connectCompletionInput(input, resource);

  const message = computed(
    (): Chat.AssistantMessage<Output, Chat.AnyTool> | null => {
      const lastMessage = resource
        .value()
        .findLast((message) => message.role !== 'activity');
      if (
        lastMessage &&
        lastMessage.role === 'assistant' &&
        lastMessage.content !== undefined &&
        lastMessage.content !== null
      ) {
        return lastMessage;
      }
      return null;
    },
    { debugName: debugName && `${debugName}.message` },
  );
  const valueSignal = computed(() => message()?.content ?? null, {
    debugName: debugName && `${debugName}.value`,
  });
  const value = toDeepSignal(valueSignal);

  const status = resource.status;
  const error = resource.error;
  const isLoading = resource.isLoading;
  const reload = resource.reload;
  const stop = resource.stop;
  const snapshot = createResourceSnapshot(
    value,
    status,
    error,
    debugName && `${debugName}.snapshot`,
  );

  function hasValue(this: StructuredCompletionResourceRef<Output, State>) {
    return status() !== 'error' && valueSignal() !== null;
  }

  const ref: StructuredCompletionResourceRef<Output, State> = {
    pendingInterrupts: resource.pendingInterrupts,
    isResuming: resource.isResuming,
    resume: resource.resume,
    state: resource.state,
    setState: resource.setState,
    value,
    snapshot,
    status,
    error,
    isLoading,
    isSending: resource.isSending,
    isGenerating: resource.isGenerating,
    isReceiving: resource.isReceiving,
    isRunningToolCalls: resource.isRunningToolCalls,
    sendingError: resource.sendingError,
    lastRunResult: resource.lastRunResult,
    generatingError: resource.generatingError,
    reload,
    stop,
    hasValue: hasValue as any,
  };

  return { ref, message };
}
