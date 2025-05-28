/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-empty-interface */
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
import { injectHashbrownConfig } from './provide-hashbrown.fn';
import { SignalLike } from './types';
import { readSignalLike, toSignal } from './utils';

export interface CompletionResourceRef extends Resource<string | null> {}

export interface CompletionResourceOptions<Input> {
  model: SignalLike<string>;
  input: Signal<Input | null | undefined>;
  system: SignalLike<string>;
}

export function completionResource<Input>(
  options: CompletionResourceOptions<Input>,
): CompletionResourceRef {
  const { model, input, system } = options;
  const injector = inject(Injector);
  const config = injectHashbrownConfig();
  const hashbrown = fryHashbrown({
    debugName: 'completionResource',
    apiUrl: config.baseUrl,
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
        content: typeof _input === 'string' ? _input : JSON.stringify(_input),
      },
    ];
  });

  const error = toSignal(hashbrown.observeError);

  const exhaustedRetries = toSignal(hashbrown.observeExhaustedRetries);

  effect(() => {
    const _messages = internalMessages();

    hashbrown.setMessages(_messages);
  });

  const value = computed(() => {
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
  });

  const status = computed(() => {
    if (exhaustedRetries()) {
      return ResourceStatus.Error;
    }

    return ResourceStatus.Idle;
  });
  const isLoading = signal(false);
  const reload = () => {
    return true;
  };

  function hasValue(this: CompletionResourceRef) {
    return Boolean(value());
  }

  return {
    value,
    status,
    error,
    isLoading,
    reload,
    hasValue: hasValue as any,
  };
}
