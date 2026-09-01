/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  computed,
  DestroyRef,
  effect,
  inject,
  Injector,
  Resource,
  ResourceStatus,
  runInInjectionContext,
  Signal,
} from '@angular/core';
import {
  Chat,
  createChatRuntime,
  s,
  type TransportOrFactory,
} from '@hashbrownai/core';
import { ɵinjectHashbrownConfig } from '../providers/provide-hashbrown.fn';
import { readReactiveOption, toNgSignal } from '../utils/signals';
import { ReactiveOption } from '../utils/types';
import { bindToolToInjector } from '../utils/create-tool.fn';
import { createTransport } from '../utils/create-transport.fn';
import { toDeepSignal } from '../utils/deep-signal';
import {
  createResourceSnapshot,
  createResourceValue,
} from './create-resource-snapshot.fn';

/**
 * A reference to the structured chat resource.
 *
 * @public
 * @typeParam Output - The type of the output from the chat.
 * @typeParam Tools - The set of tool definitions available to the chat.
 */
export interface StructuredChatResourceRef<
  Output,
  Tools extends Chat.AnyTool,
> extends Resource<Chat.Message<Output, Tools>[]> {
  /**
   * Indicates whether the underlying chat call is currently sending a message.
   */
  isSending: Signal<boolean>;
  /**
   * Indicates whether the chat is generating assistant output.
   */
  isGenerating: Signal<boolean>;
  /**
   * Whether the resource is currently receiving a response from the model.
   */
  isReceiving: Signal<boolean>;
  /**
   * Whether the chat is running tool calls.
   */
  isRunningToolCalls: Signal<boolean>;
  /**
   * Aggregate loading flag across transport, generation, and tool calls.
   */
  isLoading: Signal<boolean>;
  /** Transport/request error before generation events arrive. */
  sendingError: Signal<Error | undefined>;
  /** Error emitted during generation events. */
  generatingError: Signal<Error | undefined>;
  /**
   * Send a new user message to the chat.
   *
   * @param message - The user message to send.
   */
  sendMessage: (message: Chat.UserMessage) => void;

  /**
   * Cause current messages to be resent.  Can be used after an error in chat.
   */
  resendMessages: () => void;

  /**
   * Update the chat messages.
   *
   * @param messages - The new array of chat messages.
   */
  setMessages: (messages: Chat.Message<Output, Tools>[]) => void;

  /**
   * Remove the last assistant response and re-send the previous user message. Returns true if a reload was performed.
   *
   * @returns Whether the resource was reloaded.
   */
  reload: () => boolean;

  /**
   * Stops any currently-streaming message.
   *
   * @param clearStreamingMessage - Whether the currently-streaming message should be removed from state.
   */
  stop: (clearStreamingMessage?: boolean) => void;
  lastAssistantMessage: Signal<
    Chat.AssistantMessage<Output, Tools> | undefined
  >;
}

/**
 * Options for the structured chat resource.
 *
 * @public
 */
export interface StructuredChatResourceOptions<
  Schema extends s.SchemaOutput,
  Tools extends Chat.AnyTool,
  Output extends s.InferSchemaOutput<Schema> = s.InferSchemaOutput<Schema>,
> {
  /**
   * The system prompt to use for the structured chat resource.
   */
  system: ReactiveOption<string>;

  /**
   * The schema to use for the structured chat resource.
   */
  schema: Schema;

  /**
   * The tools to use for the structured chat resource.
   */
  tools?: Tools[];

  /**
   * The initial messages for the structured chat resource.
   */
  messages?: Chat.Message<Output, Tools>[];

  /**
   * The debug name for the structured chat resource.
   */
  debugName?: string;

  /**
   * The debounce time for the structured chat resource.
   */
  debounce?: number;

  /**
   * The number of retries for the structured chat resource.
   */
  retries?: number;

  /**
   * The API URL to use for the structured chat resource.
   */
  apiUrl?: ReactiveOption<string>;

  /**
   * Custom transport override for the structured chat resource.
   */
  transport?: TransportOrFactory;
  /**
   * Whether this structured chat is generating UI content.
   */
  ui?: boolean;

  /**
   * Optional opaque AG-UI thread identity.
   */
  threadId?: ReactiveOption<string | undefined>;
}

/**
 * Creates a structured chat resource.
 *
 * @public
 * @param options - The options for the structured chat resource.
 * @returns The structured chat resource.
 */
export function structuredChatResource<
  Schema extends s.SchemaOutput,
  Tools extends Chat.AnyTool,
  Output extends s.InferSchemaOutput<Schema> = s.InferSchemaOutput<Schema>,
>(
  options: StructuredChatResourceOptions<Schema, Tools, Output>,
): StructuredChatResourceRef<Output, Tools> {
  const config = ɵinjectHashbrownConfig();
  const injector = inject(Injector);
  const destroyRef = inject(DestroyRef);
  const resolveTransport = () =>
    createTransport({
      transport: options.transport ?? config.transport,
      readBaseUrl: () =>
        options.apiUrl !== undefined
          ? readReactiveOption(options.apiUrl)
          : config.baseUrl,
      createMiddleware: () =>
        config.middleware?.map((middleware): Chat.Middleware => {
          return (requestInit) =>
            runInInjectionContext(injector, () => middleware(requestInit));
        }),
    });
  const runtime = createChatRuntime<Schema, Tools, Output>({
    system: readReactiveOption(options.system),
    messages: [...(options.messages ?? [])],
    tools: options.tools?.map((tool) => bindToolToInjector(tool, injector)),
    responseSchema: options.schema,
    debugName: options.debugName,
    debounce: options.debounce,
    retries: options.retries,
    transport: resolveTransport(),
    ui: options.ui ?? false,
    threadId:
      options.threadId !== undefined
        ? readReactiveOption(options.threadId)
        : undefined,
  });

  const optionsEffect = effect(() => {
    runtime.updateOptions({
      system: readReactiveOption(options.system),
      transport: resolveTransport(),
      ui: options.ui ?? false,
      ...(options.threadId !== undefined
        ? { threadId: readReactiveOption(options.threadId) }
        : {}),
    });
  });

  const teardown = runtime.start();

  destroyRef.onDestroy(() => {
    teardown();
    optionsEffect.destroy();
  });

  const rawValueSignal = toNgSignal(
    runtime.messages,
    options.debugName && `${options.debugName}.rawValue`,
  );
  const rawValue = toDeepSignal(rawValueSignal);
  const isReceiving = toNgSignal(
    runtime.isReceiving,
    options.debugName && `${options.debugName}.isReceiving`,
  );
  const isSending = toNgSignal(
    runtime.isSending,
    options.debugName && `${options.debugName}.isSending`,
  );
  const isGenerating = toNgSignal(
    runtime.isGenerating,
    options.debugName && `${options.debugName}.isGenerating`,
  );
  const isRunningToolCalls = toNgSignal(
    runtime.isRunningToolCalls,
    options.debugName && `${options.debugName}.isRunningToolCalls`,
  );
  const isLoading = toNgSignal(
    runtime.isLoading,
    options.debugName && `${options.debugName}.isLoading`,
  );
  const error = toNgSignal(
    runtime.error,
    options.debugName && `${options.debugName}.error`,
  );
  const sendingError = toNgSignal(
    runtime.sendingError,
    options.debugName && `${options.debugName}.sendingError`,
  );
  const generatingError = toNgSignal(
    runtime.generatingError,
    options.debugName && `${options.debugName}.generatingError`,
  );
  const lastAssistantMessage = toNgSignal(
    runtime.lastAssistantMessage,
    options.debugName && `${options.debugName}.lastAssistantMessage`,
  );
  const status = computed(
    (): ResourceStatus => {
      if (isLoading()) {
        return 'loading';
      }

      if (error()) {
        return 'error';
      }

      const hasAssistantMessage = rawValue().some(
        (message) => message.role === 'assistant',
      );

      if (hasAssistantMessage) {
        return 'resolved';
      }

      return 'idle';
    },
    { debugName: options.debugName && `${options.debugName}.status` },
  );
  const value = createResourceValue(
    rawValue,
    status,
    error,
    options.debugName && `${options.debugName}.value`,
  );
  const snapshot = createResourceSnapshot(
    value,
    status,
    error,
    options.debugName && `${options.debugName}.snapshot`,
  );

  function reload() {
    const messages = rawValue();
    const lastMessage = messages[messages.length - 1];

    if (lastMessage?.role === 'assistant') {
      runtime.setMessages(messages.slice(0, -1));

      return true;
    }

    return false;
  }

  function hasValue() {
    return (
      status() !== 'error' &&
      rawValue().some((message) => message.role === 'assistant')
    );
  }

  function sendMessage(message: Chat.UserMessage) {
    runtime.sendMessage(message);
  }

  function resendMessages() {
    runtime.resendMessages();
  }

  function setMessages(messages: Chat.Message<Output, Tools>[]) {
    runtime.setMessages(messages);
  }

  function stop(clearStreamingMessage = false) {
    runtime.stop(clearStreamingMessage);
  }

  return {
    hasValue: hasValue as any,
    snapshot,
    status,
    isLoading,
    isGenerating,
    isSending,
    isReceiving,
    isRunningToolCalls,
    reload,
    sendMessage,
    resendMessages,
    stop,
    value,
    error,
    sendingError,
    generatingError,
    setMessages,
    lastAssistantMessage,
  };
}
