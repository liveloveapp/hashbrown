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
import { Chat, fryHashbrown, type TransportOrFactory } from '@hashbrownai/core';
import { ɵinjectHashbrownConfig } from '../providers/provide-hashbrown.fn';
import { SignalLike } from '../utils/types';
import { readSignalLike, toNgSignal } from '../utils/signals';

/**
 * A reference to the completion resource.
 *
 * @public
 */
export interface CompletionResourceRef extends Resource<string | null> {
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
  /** Indicates whether the chat is receiving tokens. */
  isReceiving: Signal<boolean>;
  /** Indicates whether the chat is sending. */
  isSending: Signal<boolean>;
  /** Indicates whether the chat is generating. */
  isGenerating: Signal<boolean>;
  /** Indicates whether tool calls are running. */
  isRunningToolCalls: Signal<boolean>;
  /** Aggregate loading flag across transport, generation, tool calls, and thread load/save. */
  isLoading: Signal<boolean>;
  /** Whether a thread load request is in flight. */
  isLoadingThread: Signal<boolean>;
  /** Whether a thread save request is in flight. */
  isSavingThread: Signal<boolean>;
  /** Error encountered while loading a thread. */
  threadLoadError: Signal<{ error: string; stacktrace?: string } | undefined>;
  /** Error encountered while saving a thread. */
  threadSaveError: Signal<{ error: string; stacktrace?: string } | undefined>;
  /** Transport/request error before generation frames arrive. */
  sendingError: Signal<Error | undefined>;
  /** Error emitted during generation frames. */
  generatingError: Signal<Error | undefined>;
}

/**
 * Options for the completion resource.
 *
 * @public
 */
export interface CompletionResourceOptions<Input> {
  /**
   * The model to use for the completion.
   */
  model: SignalLike<string>;

  /**
   * The input to the completion.
   */
  input: Signal<Input | null | undefined>;

  /**
   * The system prompt to use for the completion.
   */
  system: SignalLike<string>;

  /**
   * The API URL to use for the completion.
   */
  apiUrl?: string;

  /**
   * The debug name for the completion resource.
   */
  debugName?: string;

  /**
   * Custom transport override for this completion resource.
   */
  transport?: TransportOrFactory;

  /**
   * Optional thread identifier used to load or continue an existing conversation.
   */
  threadId?: SignalLike<string | undefined>;
}

/**
 * Creates a completion resource.
 *
 * @public
 * @param options - The options for the completion resource.
 * @typeParam Input - The type of the input to the completion.
 * @returns The completion resource.
 */
export function completionResource<Input>(
  options: CompletionResourceOptions<Input>,
): CompletionResourceRef {
  const { model, input, system } = options;
  const injector = inject(Injector);
  const destroyRef = inject(DestroyRef);
  const config = ɵinjectHashbrownConfig();
  const hashbrown = fryHashbrown({
    debugName: options.debugName,
    apiUrl: options.apiUrl ?? config.baseUrl,
    middleware: config.middleware?.map((m): Chat.Middleware => {
      return (requestInit) =>
        runInInjectionContext(injector, () => m(requestInit));
    }),
    model: readSignalLike(model),
    system: readSignalLike(system),
    messages: [],
    tools: [],
    retries: 3,
    transport: options.transport ?? config.transport,
    threadId: options.threadId ? readSignalLike(options.threadId) : undefined,
  });

  const teardown = hashbrown.sizzle();

  destroyRef.onDestroy(() => teardown());

  const messages = toNgSignal(hashbrown.messages);
  const isReceiving = toNgSignal(hashbrown.isReceiving);
  const isSending = toNgSignal(hashbrown.isSending);
  const isGenerating = toNgSignal(hashbrown.isGenerating);
  const isRunningToolCalls = toNgSignal(hashbrown.isRunningToolCalls);
  const isLoading = toNgSignal(hashbrown.isLoading);
  const isLoadingThread = toNgSignal(hashbrown.isLoadingThread);
  const isSavingThread = toNgSignal(hashbrown.isSavingThread);
  const sendingError = toNgSignal(hashbrown.sendingError);
  const generatingError = toNgSignal(hashbrown.generatingError);
  const threadLoadError = toNgSignal(hashbrown.threadLoadError);
  const threadSaveError = toNgSignal(hashbrown.threadSaveError);
  const internalMessages = computed(() => {
    const _input = input();

    if (!_input) {
      return [];
    }

    return [
      {
        role: 'user' as const,
        content: _input,
      },
    ];
  });

  const error = toNgSignal(
    hashbrown.error,
    options.debugName && `${options.debugName}.error`,
  );

  const exhaustedRetries = toNgSignal(
    hashbrown.exhaustedRetries,
    options.debugName && `${options.debugName}.exhaustedRetries`,
  );

  effect(() => {
    const _messages = internalMessages();

    hashbrown.setMessages(_messages);
  });

  const value = computed(
    () => {
      const lastMessage = messages()[messages().length - 1];

      if (
        lastMessage &&
        lastMessage.role === 'assistant' &&
        lastMessage.content &&
        typeof lastMessage.content === 'string'
      ) {
        return lastMessage.content;
      }
      return null;
    },
    { debugName: options.debugName && `${options.debugName}.value` },
  );

  const status = computed((): ResourceStatus => {
    if (isLoading()) {
      return 'loading';
    }

    if (exhaustedRetries()) {
      return 'error';
    }

    return 'idle';
  });
  const reload = () => {
    return true;
  };

  function hasValue(this: CompletionResourceRef) {
    return Boolean(value());
  }

  function stop(clearStreamingMessage = false) {
    hashbrown.stop(clearStreamingMessage);
  }

  return {
    value,
    status,
    error,
    isLoading,
    isReceiving,
    isSending,
    isGenerating,
    isRunningToolCalls,
    isLoadingThread,
    isSavingThread,
    sendingError,
    generatingError,
    threadLoadError,
    threadSaveError,
    reload,
    stop,
    hasValue: hasValue as any,
  };
}
