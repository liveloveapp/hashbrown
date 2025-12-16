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
  fryHashbrown,
  type ModelInput,
  s,
  type TransportOrFactory,
} from '@hashbrownai/core';
import { ɵinjectHashbrownConfig } from '../providers/provide-hashbrown.fn';
import { readSignalLike, toNgSignal } from '../utils/signals';
import { SignalLike } from '../utils/types';
import { bindToolToInjector } from '../utils/create-tool.fn';
import { toDeepSignal } from '../utils/deep-signal';

/**
 * A reference to the structured chat resource.
 *
 * @public
 * @typeParam Output - The type of the output from the chat.
 * @typeParam Tools - The set of tool definitions available to the chat.
 */
export interface StructuredChatResourceRef<Output, Tools extends Chat.AnyTool>
  extends Resource<Chat.Message<Output, Tools>[]> {
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
   * Aggregate loading flag across transport, generation, tool calls, and thread load/save.
   */
  isLoading: Signal<boolean>;
  /** Indicates whether a thread load request is in flight. */
  isLoadingThread: Signal<boolean>;
  /** Indicates whether a thread save request is in flight. */
  isSavingThread: Signal<boolean>;
  /** Transport/request error before generation frames arrive. */
  sendingError: Signal<Error | undefined>;
  /** Error emitted during generation frames. */
  generatingError: Signal<Error | undefined>;
  /** Thread loading error, if present. */
  threadLoadError: Signal<{ error: string; stacktrace?: string } | undefined>;
  /** Thread saving error, if present. */
  threadSaveError: Signal<{ error: string; stacktrace?: string } | undefined>;
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
  Schema extends s.HashbrownType,
  Tools extends Chat.AnyTool,
  Output extends s.Infer<Schema> = s.Infer<Schema>,
> {
  /**
   * The model to use for the structured chat resource.
   */
  model: ModelInput;

  /**
   * The system prompt to use for the structured chat resource.
   */
  system: string | Signal<string>;

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
  apiUrl?: string;

  /**
   * Custom transport override for the structured chat resource.
   */
  transport?: TransportOrFactory;
  /**
   * Whether this structured chat is generating UI content.
   */
  ui?: boolean;

  /**
   * Optional thread identifier used to load or continue an existing conversation.
   */
  threadId?: SignalLike<string | undefined>;
}

/**
 * Creates a structured chat resource.
 *
 * @public
 * @param options - The options for the structured chat resource.
 * @returns The structured chat resource.
 */
export function structuredChatResource<
  Schema extends s.HashbrownType,
  Tools extends Chat.AnyTool,
  Output extends s.Infer<Schema> = s.Infer<Schema>,
>(
  options: StructuredChatResourceOptions<Schema, Tools, Output>,
): StructuredChatResourceRef<Output, Tools> {
  const config = ɵinjectHashbrownConfig();
  const injector = inject(Injector);
  const destroyRef = inject(DestroyRef);
  const hashbrown = fryHashbrown<Schema, Tools, Output>({
    apiUrl: options.apiUrl ?? config.baseUrl,
    middleware: config.middleware?.map((m): Chat.Middleware => {
      return (requestInit) =>
        runInInjectionContext(injector, () => m(requestInit));
    }),
    system: readSignalLike(options.system),
    messages: [...(options.messages ?? [])],
    model: options.model,
    tools: options.tools?.map((tool) => bindToolToInjector(tool, injector)),
    responseSchema: options.schema,
    debugName: options.debugName,
    emulateStructuredOutput: config.emulateStructuredOutput,
    debounce: options.debounce,
    retries: options.retries,
    transport: options.transport ?? config.transport,
    ui: options.ui ?? false,
    threadId: options.threadId ? readSignalLike(options.threadId) : undefined,
  });

  const optionsEffect = effect(() => {
    const model = options.model;
    const system = readSignalLike(options.system);
    const threadId = options.threadId
      ? readSignalLike(options.threadId)
      : undefined;

    hashbrown.updateOptions({
      model,
      system,
      ui: options.ui ?? false,
      threadId,
    });
  });

  const teardown = hashbrown.sizzle();

  destroyRef.onDestroy(() => {
    teardown();
    optionsEffect.destroy();
  });

  const valueSignal = toNgSignal(
    hashbrown.messages,
    options.debugName && `${options.debugName}.value`,
  );
  const value = toDeepSignal(valueSignal);
  const isReceiving = toNgSignal(
    hashbrown.isReceiving,
    options.debugName && `${options.debugName}.isReceiving`,
  );
  const isSending = toNgSignal(
    hashbrown.isSending,
    options.debugName && `${options.debugName}.isSending`,
  );
  const isGenerating = toNgSignal(
    hashbrown.isGenerating,
    options.debugName && `${options.debugName}.isGenerating`,
  );
  const isRunningToolCalls = toNgSignal(
    hashbrown.isRunningToolCalls,
    options.debugName && `${options.debugName}.isRunningToolCalls`,
  );
  const isLoading = toNgSignal(
    hashbrown.isLoading,
    options.debugName && `${options.debugName}.isLoading`,
  );
  const error = toNgSignal(
    hashbrown.error,
    options.debugName && `${options.debugName}.error`,
  );
  const sendingError = toNgSignal(
    hashbrown.sendingError,
    options.debugName && `${options.debugName}.sendingError`,
  );
  const generatingError = toNgSignal(
    hashbrown.generatingError,
    options.debugName && `${options.debugName}.generatingError`,
  );
  const lastAssistantMessage = toNgSignal(
    hashbrown.lastAssistantMessage,
    options.debugName && `${options.debugName}.lastAssistantMessage`,
  );
  const exhaustedRetries = toNgSignal(hashbrown.exhaustedRetries);
  const isLoadingThread = toNgSignal(
    hashbrown.isLoadingThread,
    options.debugName && `${options.debugName}.isLoadingThread`,
  );
  const isSavingThread = toNgSignal(
    hashbrown.isSavingThread,
    options.debugName && `${options.debugName}.isSavingThread`,
  );
  const threadLoadError = toNgSignal(
    hashbrown.threadLoadError,
    options.debugName && `${options.debugName}.threadLoadError`,
  );
  const threadSaveError = toNgSignal(
    hashbrown.threadSaveError,
    options.debugName && `${options.debugName}.threadSaveError`,
  );

  const status = computed(
    (): ResourceStatus => {
      if (isLoading()) {
        return 'loading';
      }

      if (exhaustedRetries()) {
        return 'error';
      }

      const hasAssistantMessage = value().some(
        (message) => message.role === 'assistant',
      );

      if (hasAssistantMessage) {
        return 'resolved';
      }

      return 'idle';
    },
    { debugName: options.debugName && `${options.debugName}.status` },
  );

  function reload() {
    const lastMessage = value()[value().length - 1];

    if (lastMessage.role === 'assistant') {
      hashbrown.setMessages(value().slice(0, -1));

      return true;
    }

    return false;
  }

  function hasValue() {
    return value().some((message) => message.role === 'assistant');
  }

  function sendMessage(message: Chat.UserMessage) {
    hashbrown.sendMessage(message);
  }

  function resendMessages() {
    hashbrown.resendMessages();
  }

  function setMessages(messages: Chat.Message<Output, Tools>[]) {
    hashbrown.setMessages(messages);
  }

  function stop(clearStreamingMessage = false) {
    hashbrown.stop(clearStreamingMessage);
  }

  return {
    hasValue: hasValue as any,
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
    isLoadingThread,
    isSavingThread,
    threadLoadError,
    threadSaveError,
  };
}
