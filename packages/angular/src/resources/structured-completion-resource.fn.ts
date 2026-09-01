/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, effect, Resource, Signal } from '@angular/core';
import { Chat, s, type TransportOrFactory } from '@hashbrownai/core';
import { ReactiveOption } from '../utils/types';
import { structuredChatResource } from './structured-chat-resource.fn';
import { toDeepSignal } from '../utils/deep-signal';
import { createResourceSnapshot } from './create-resource-snapshot.fn';

/**
 * A reference to the structured completion resource.
 *
 * @public
 */
export interface StructuredCompletionResourceRef<
  Output,
> extends Resource<Output | null> {
  /**
   * Indicates whether the underlying completion call is currently sending a message.
   */
  isSending: Signal<boolean>;
  /**
   * Indicates whether the completion is generating assistant output.
   */
  isGenerating: Signal<boolean>;
  /**
   * Indicates whether the underlying completion call is currently receiving tokens.
   */
  isReceiving: Signal<boolean>;
  /** Indicates whether tool calls are running. */
  isRunningToolCalls: Signal<boolean>;
  /** Aggregate loading flag across transport, generation, and tool calls. */
  isLoading: Signal<boolean>;
  /** Transport/request error before generation events arrive. */
  sendingError: Signal<Error | undefined>;
  /** Error emitted during generation events. */
  generatingError: Signal<Error | undefined>;
  /**
   * Reloads the resource.
   *
   * @returns Whether the resource was reloaded.
   */
  reload: () => boolean;

  /**
   * Stops any currently-streaming message.
   * @param clearStreamingMessage - Whether the currently-streaming message should be removed from state.
   */
  stop: (clearStreamingMessage?: boolean) => void;
}

/**
 * Options for the structured completion resource.
 *
 * @public
 */
export interface StructuredCompletionResourceOptions<
  Input,
  Schema extends s.SchemaOutput,
> {
  /**
   * The input to the structured completion resource.
   */
  input: Signal<Input | null | undefined>;
  /**
   * The schema to use for the structured completion resource.
   */
  schema: Schema;
  /**
   * The system prompt to use for the structured completion resource.
   */
  system: ReactiveOption<string>;
  /**
   * The tools to use for the structured completion resource.
   */
  tools?: Chat.AnyTool[];
  /**
   * The debug name for the structured completion resource.
   */
  debugName?: string;
  /**
   * The API URL to use for the structured completion resource.
   */
  apiUrl?: ReactiveOption<string>;
  /**
   * The number of retries for the structured completion resource.
   */
  retries?: number;
  /**
   * The debounce time for the structured completion resource.
   */
  debounce?: number;

  /**
   * Optional transport override for this structured completion resource.
   */
  transport?: TransportOrFactory;
  /**
   * Whether this completion is UI generating.
   */
  ui?: boolean;

  /**
   * Optional opaque AG-UI thread identity.
   */
  threadId?: ReactiveOption<string | undefined>;
}

/**
 * Creates a structured completion resource.
 *
 * @public
 * @param options - The options for the structured completion resource.
 * @returns The structured completion resource.
 */
export function structuredCompletionResource<
  Input,
  Schema extends s.SchemaOutput,
  Output extends s.InferSchemaOutput<Schema> = s.InferSchemaOutput<Schema>,
>(
  options: StructuredCompletionResourceOptions<Input, Schema>,
): StructuredCompletionResourceRef<Output> {
  const { input, schema, system, tools, debugName, apiUrl, retries, debounce } =
    options;

  const resource = structuredChatResource<Schema, Chat.AnyTool, Output>({
    system,
    schema,
    tools,
    debugName,
    apiUrl,
    retries,
    debounce,
    transport: options.transport,
    ui: options.ui ?? false,
    threadId: options.threadId,
  });

  effect(() => {
    const _input = input();

    if (!_input) {
      return;
    }

    resource.setMessages([
      {
        role: 'user',
        content: _input,
      },
    ]);
  });

  const valueSignal = computed(
    () => {
      const messages = resource.value();
      const lastMessage = messages[messages.length - 1];
      if (
        lastMessage &&
        lastMessage.role === 'assistant' &&
        lastMessage.content !== undefined &&
        lastMessage.content !== null
      ) {
        return lastMessage.content;
      }
      return null;
    },
    { debugName: debugName && `${debugName}.value` },
  );
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

  function hasValue(this: StructuredCompletionResourceRef<Output>) {
    return status() !== 'error' && valueSignal() !== null;
  }

  return {
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
    generatingError: resource.generatingError,
    reload,
    stop,
    hasValue: hasValue as any,
  };
}
