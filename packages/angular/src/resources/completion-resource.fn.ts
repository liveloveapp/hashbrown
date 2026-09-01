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
import { ReactiveOption } from '../utils/types';
import { readReactiveOption, toNgSignal } from '../utils/signals';
import {
  createResourceSnapshot,
  createResourceValue,
} from './create-resource-snapshot.fn';

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
  /** Aggregate loading flag across transport, generation, and tool calls. */
  isLoading: Signal<boolean>;
  /** Transport/request error before generation events arrive. */
  sendingError: Signal<Error | undefined>;
  /** Error emitted during generation events. */
  generatingError: Signal<Error | undefined>;
}

/**
 * Options for the completion resource.
 *
 * @public
 */
export interface CompletionResourceOptions<Input> {
  /**
   * The input to the completion.
   */
  input: Signal<Input | null | undefined>;

  /**
   * The system prompt to use for the completion.
   */
  system: ReactiveOption<string>;

  /**
   * The API URL to use for the completion.
   */
  apiUrl?: ReactiveOption<string>;

  /**
   * The debug name for the completion resource.
   */
  debugName?: string;

  /**
   * Custom transport override for this completion resource.
   */
  transport?: TransportOrFactory;

  /**
   * Optional opaque AG-UI thread identity.
   */
  threadId?: ReactiveOption<string | undefined>;
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
  const { input, system } = options;
  const injector = inject(Injector);
  const destroyRef = inject(DestroyRef);
  const config = ɵinjectHashbrownConfig();
  const hashbrown = fryHashbrown({
    debugName: options.debugName,
    apiUrl:
      options.apiUrl !== undefined
        ? readReactiveOption(options.apiUrl)
        : config.baseUrl,
    middleware: config.middleware?.map((m): Chat.Middleware => {
      return (requestInit) =>
        runInInjectionContext(injector, () => m(requestInit));
    }),
    system: readReactiveOption(system),
    messages: [],
    tools: [],
    retries: 3,
    transport: options.transport ?? config.transport,
    threadId:
      options.threadId !== undefined
        ? readReactiveOption(options.threadId)
        : undefined,
  });

  const optionsEffect = effect(() => {
    hashbrown.updateOptions({
      debugName: options.debugName,
      apiUrl:
        options.apiUrl !== undefined
          ? readReactiveOption(options.apiUrl)
          : config.baseUrl,
      middleware: config.middleware?.map((m): Chat.Middleware => {
        return (requestInit) =>
          runInInjectionContext(injector, () => m(requestInit));
      }),
      system: readReactiveOption(system),
      tools: [],
      retries: 3,
      transport: options.transport ?? config.transport,
      ...(options.threadId !== undefined
        ? { threadId: readReactiveOption(options.threadId) }
        : {}),
    });
  });

  const teardown = hashbrown.sizzle();

  destroyRef.onDestroy(() => {
    teardown();
    optionsEffect.destroy();
  });

  const messages = toNgSignal(hashbrown.messages);
  const isReceiving = toNgSignal(hashbrown.isReceiving);
  const isSending = toNgSignal(hashbrown.isSending);
  const isGenerating = toNgSignal(hashbrown.isGenerating);
  const isRunningToolCalls = toNgSignal(hashbrown.isRunningToolCalls);
  const isLoading = toNgSignal(hashbrown.isLoading);
  const sendingError = toNgSignal(hashbrown.sendingError);
  const generatingError = toNgSignal(hashbrown.generatingError);
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

  effect(() => {
    const _messages = internalMessages();

    hashbrown.setMessages(_messages);
  });

  const rawValue = computed(
    () => {
      const lastMessage = messages()[messages().length - 1];

      if (
        lastMessage &&
        lastMessage.role === 'assistant' &&
        typeof lastMessage.content === 'string'
      ) {
        return lastMessage.content;
      }
      return null;
    },
    { debugName: options.debugName && `${options.debugName}.rawValue` },
  );

  const status = computed((): ResourceStatus => {
    if (isLoading()) {
      return 'loading';
    }

    if (error()) {
      return 'error';
    }

    if (rawValue() !== null) {
      return 'resolved';
    }

    return 'idle';
  });
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
  const reload = () => {
    const currentMessages = messages();
    const lastMessage = currentMessages[currentMessages.length - 1];

    if (!lastMessage) {
      return false;
    }

    const requestMessages =
      lastMessage.role === 'assistant'
        ? currentMessages.slice(0, -1)
        : currentMessages;
    const lastRequestMessage = requestMessages.findLast(
      (message) => message.role !== 'error',
    );

    if (lastRequestMessage?.role !== 'user') {
      return false;
    }

    if (lastMessage.role === 'assistant') {
      hashbrown.setMessages(requestMessages);

      return true;
    }

    hashbrown.resendMessages();

    return true;
  };

  function hasValue(this: CompletionResourceRef) {
    return status() !== 'error' && rawValue() !== null;
  }

  function stop(clearStreamingMessage = false) {
    hashbrown.stop(clearStreamingMessage);
  }

  return {
    value,
    snapshot,
    status,
    error,
    isLoading,
    isReceiving,
    isSending,
    isGenerating,
    isRunningToolCalls,
    sendingError,
    generatingError,
    reload,
    stop,
    hasValue: hasValue as any,
  };
}
