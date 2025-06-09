/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  computed,
  effect,
  inject,
  Injector,
  Resource,
  ResourceStatus,
  runInInjectionContext,
  Signal,
  signal,
} from '@angular/core';
import { Chat, fryHashbrown } from '@hashbrownai/core';
import { ɵinjectHashbrownConfig } from '../providers/provide-hashbrown.fn';
import { SignalLike } from '../utils/types';
import { readSignalLike, toSignal } from '../utils/signals';

/**
 * A reference to the completion resource.
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
   * @param clearStreamingMessage Whether the currently-streaming message should be removed from state.
   */
  stop: (clearStreamingMessage?: boolean) => void;
}

/**
 * Options for the completion resource.
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
}

/**
 * Creates a completion resource.
 *
 * @param options - The options for the completion resource.
 * @returns The completion resource.
 */
export function completionResource<Input>(
  options: CompletionResourceOptions<Input>,
): CompletionResourceRef {
  const { model, input, system } = options;
  const injector = inject(Injector);
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
  });

  const messages = toSignal(hashbrown.observeMessages);
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

  const error = toSignal(
    hashbrown.observeError,
    options.debugName && `${options.debugName}.error`,
  );

  const exhaustedRetries = toSignal(
    hashbrown.observeExhaustedRetries,
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
    if (exhaustedRetries()) {
      return 'error';
    }

    return 'idle';
  });
  const isLoading = signal(false);
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
    reload,
    stop,
    hasValue: hasValue as any,
  };
}
