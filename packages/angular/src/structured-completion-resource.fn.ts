/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-empty-interface */
import { computed, Resource, Signal } from '@angular/core';
import { s } from '@hashbrownai/core';
import { SignalLike } from './types';
import { structuredChatResource } from './structured-chat-resource.fn';
import { BoundTool } from './create-tool.fn';

export interface StructuredCompletionResourceRef<Output extends s.HashbrownType>
  extends Resource<s.Infer<Output> | null> {}

export interface StructuredCompletionResourceOptions<
  Input,
  Output extends s.HashbrownType,
> {
  model: string;
  input: Signal<Input | null | undefined>;
  examples?: {
    input: Input;
    output: s.Infer<Output>;
  }[];
  output: Output;
  system: SignalLike<string>;
  tools?: SignalLike<BoundTool<string, any>[]>;
}

export function structuredCompletionResource<
  Input,
  Output extends s.HashbrownType,
>(
  options: StructuredCompletionResourceOptions<Input, Output>,
): StructuredCompletionResourceRef<Output> {
  const {
    model,
    input,
    output: responseFormat,
    system,
    examples = [],
    tools,
  } = options;
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
        Output: ${JSON.stringify(example.output)}
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

  const resource = structuredChatResource({
    model,
    responseFormat,
    messages,
    tools,
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

  function hasValue(this: StructuredCompletionResourceRef<Output>) {
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
