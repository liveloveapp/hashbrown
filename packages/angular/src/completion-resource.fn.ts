/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-empty-interface */
import { computed, Resource, Signal } from '@angular/core';
import { SignalLike } from './types';
import { chatResource } from './chat-resource.fn';

export interface CompletionResourceRef extends Resource<string | null> {}

export interface CompletionResourceOptions<Input> {
  model: SignalLike<string>;
  input: Signal<Input | null | undefined>;
  examples?: {
    input: Input;
    output: string;
  }[];
  system: SignalLike<string>;
}

export function completionResource<Input>(
  options: CompletionResourceOptions<Input>,
): CompletionResourceRef {
  const { model, input, system, examples = [] } = options;
  const messages = computed(() => {
    const _input = input();
    const _system = typeof system === 'string' ? system : system();
    const _fullInstructions = `
      ${_system}

      ## Examples
      ${examples
        .map(
          (example) => `
        Input: ${JSON.stringify(example.input)}
        Output: ${example.output}
      `,
        )
        .join('\n')}
    `;

    if (!_input) {
      return [
        {
          role: 'system' as const,
          content: _fullInstructions,
        },
      ];
    }

    return [
      {
        role: 'system' as const,
        content: _fullInstructions,
      },
      {
        role: 'user' as const,
        content: JSON.stringify(_input),
      },
    ];
  });

  const resource = chatResource({
    model,
    messages,
  });

  const value = computed(() => {
    const lastMessage = resource.value()[resource.value().length - 1];
    if (lastMessage.role === 'assistant' && lastMessage.content) {
      return lastMessage.content;
    }
    return null;
  });

  const status = resource.status;
  const error = resource.error;
  const isLoading = resource.isLoading;
  const reload = resource.reload;

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
