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
import { Chat, fryHashbrown, KnownModelIds, s } from '@hashbrownai/core';
import { ɵinjectHashbrownConfig } from '../providers/provide-hashbrown.fn';
import { readSignalLike, toNgSignal } from '../utils/signals';
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
   * Whether the resource is currently receiving a response from the model.
   */
  isReceiving: Signal<boolean>;
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
  model: KnownModelIds | Signal<KnownModelIds>;

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
    model: readSignalLike(options.model),
    tools: options.tools?.map((tool) => bindToolToInjector(tool, injector)),
    responseSchema: options.schema,
    debugName: options.debugName,
    emulateStructuredOutput: config.emulateStructuredOutput,
    debounce: options.debounce,
    retries: options.retries,
  });

  const optionsEffect = effect(() => {
    const model = readSignalLike(options.model);
    const system = readSignalLike(options.system);

    hashbrown.updateOptions({
      model,
      system,
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
  const isRunningToolCalls = toNgSignal(
    hashbrown.isRunningToolCalls,
    options.debugName && `${options.debugName}.isRunningToolCalls`,
  );
  const error = toNgSignal(
    hashbrown.error,
    options.debugName && `${options.debugName}.error`,
  );
  const lastAssistantMessage = toNgSignal(
    hashbrown.lastAssistantMessage,
    options.debugName && `${options.debugName}.lastAssistantMessage`,
  );
  const exhaustedRetries = toNgSignal(hashbrown.exhaustedRetries);

  const status = computed(
    (): ResourceStatus => {
      if (isReceiving() || isSending() || isRunningToolCalls()) {
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

  const isLoading = computed(
    () => {
      return isReceiving() || isSending() || isRunningToolCalls();
    },
    { debugName: options.debugName && `${options.debugName}.isLoading` },
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
    isReceiving,
    reload,
    sendMessage,
    resendMessages,
    stop,
    value,
    error,
    setMessages,
    lastAssistantMessage,
  };
}
