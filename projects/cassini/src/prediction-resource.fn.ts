import { Signal, signal, computed } from '@angular/core';
import { distinctUntilChanged, debounceTime, of, tap, filter } from 'rxjs';
import { ZodSchema } from 'zod';
import { SystemMessage } from './types';
import { chatResource } from './chat-resource.fn';
import { createTool } from './create-tool.fn';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { toObservable } from '@angular/core/rxjs-interop';

export function predictionResource<Input, Output>(args: {
  input: Signal<Input | null | undefined>;
  description: string;
  outputSchema: ZodSchema<Output>;
  model: string;
  temperature?: number;
  maxTokens?: number;
  examples?: { input: Input; output: Output }[];
}) {
  const systemMessage: SystemMessage = {
    role: 'system',
    content: `
        You are an AI that predicts the output of a function based on the input.
        The input will be provided. You must call the "prediction" function with
        your prediction. It must match the output schema. There is no reason to
        include any other text in your response. If a tool call returns "{ success: true }"
        then you are done. If it returns "{ success: false }" then you must try again.
        Do not try again if you are done. 

        Here's a more detailed description of what you are predicting:
        ${args.description}

        Here are examples:
        ${args.examples
          ?.map(
            (example) => `
          Input: ${JSON.stringify(example.input)}
          Output: ${JSON.stringify(example.output)}
        `
          )
          .join('\n')}
      `,
  };
  const output = signal<Output | null>(null);

  const chat = chatResource({
    model: args.model,
    temperature: args.temperature,
    maxTokens: args.maxTokens,
    messages: [],
    tools: [
      createTool({
        name: 'prediction',
        description: 'Predict the output of a function',
        schema: args.outputSchema,
        handler: (args: Output) => {
          output.set(args);
          return of({ success: true });
        },
      }),
    ],
  });

  const isPredicting = computed(() => {
    return chat.isSending() || chat.isReceiving();
  });

  toObservable(args.input)
    .pipe(
      tap(() => {
        output.set(null);
      }),
      distinctUntilChanged(),
      debounceTime(250),
      filter((input): input is Input => input !== null),
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
  
              Call the "prediction" function with your prediction.
            `,
          },
        ]);
      }),
      takeUntilDestroyed()
    )
    .subscribe();

  return {
    output,
    isPredicting,
  };
}
