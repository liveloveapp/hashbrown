import { Signal, signal, computed } from '@angular/core';
import { distinctUntilChanged, debounceTime, tap, filter } from 'rxjs';
import { SystemMessage, Tool } from './types';
import { chatResource } from './chat-resource.fn';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { toObservable } from '@angular/core/rxjs-interop';
import { s } from './schema';
import { BoundTool } from './create-tool.fn';

export function toolResultResource<
  Input,
  OutputSchema extends s.AnyType
>(args: {
  input: Signal<Input | null | undefined>;
  description: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  examples?: { input: Input; output: s.Infer<OutputSchema> }[];
  tool: BoundTool<string, OutputSchema, object>;
}) {
  const systemMessage: SystemMessage = {
    role: 'system',
    content: `
        You are an AI that, given user input, is expected to call the given tool
        with the appropriate arguments.

        Here's a more info on your task:
        ${args.description}

        Here are examples:
        ${args.examples
          ?.map(
            (example) => `
          Input: ${JSON.stringify(example.input)}
          Output: ${JSON.stringify(
            (example as unknown as { output: object }).output
          )}
        `
          )
          .join('\n')}
      `,
  };
  const output = signal<s.Infer<OutputSchema> | null>(null);

  const chat = chatResource({
    model: args.model,
    temperature: args.temperature,
    maxTokens: args.maxTokens,
    messages: [],
    tools: [args.tool],
  });

  const isRunning = computed(() => {
    return chat.isSending() || chat.isReceiving();
  });

  toObservable(args.input)
    .pipe(
      tap(() => {
        output.set(null);
      }),
      distinctUntilChanged(),
      debounceTime(250),
      filter((input): input is Input => input !== null && input !== undefined),
      tap((input) => {
        chat.setMessages([
          systemMessage,
          {
            role: 'user',
            content: `
              This is the current input:
              <input>
              ${JSON.stringify(input)}
              </input>
  
              Call the "${args.tool.name}" function.
            `,
          },
        ]);
      }),
      takeUntilDestroyed()
    )
    .subscribe();

  return {
    output,
    isRunning,
  };
}
