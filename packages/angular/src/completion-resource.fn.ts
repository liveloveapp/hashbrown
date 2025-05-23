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
  prompt: SignalLike<string>;
}

export function completionResource<Input>(
  options: CompletionResourceOptions<Input>,
): CompletionResourceRef {
  const { model, input, prompt } = options;
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
    prompt: readSignalLike(prompt),
    temperature: 1,
    maxTokens: 1000,
    messages: [],
    tools: [],
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

  const status = signal(ResourceStatus.Idle);
  const error = signal<Error | null>(null);
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
