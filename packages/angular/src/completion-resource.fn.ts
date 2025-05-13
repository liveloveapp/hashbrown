/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-empty-interface */
import {
  computed,
  effect,
  Resource,
  ResourceStatus,
  Signal,
  signal,
} from '@angular/core';
import { fryHashbrown } from '@hashbrownai/core';
import { SignalLike } from './types';
import { injectHashbrownConfig } from './provide-hashbrown.fn';
import { readSignalLike, toSignal } from './utils';

export interface CompletionResourceRef extends Resource<string | null> {}

export interface CompletionResourceOptions<Input> {
  model: SignalLike<string>;
  input: Signal<Input | null | undefined>;
  examples?: {
    input: Input;
    output: string;
  }[];
  prompt: SignalLike<string>;
}

export function completionResource<Input>(
  options: CompletionResourceOptions<Input>,
): CompletionResourceRef {
  const { model, input, prompt, examples = [] } = options;
  const config = injectHashbrownConfig();
  const hashbrown = fryHashbrown({
    debugName: 'completionResource',
    apiUrl: config.baseUrl,
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
