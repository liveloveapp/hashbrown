import { computed, effect, Signal } from '@angular/core';
import { ZodError, ZodSchema } from 'zod';
import { SignalLike } from './types';
import { SystemMessage } from './types';
import { chatResource } from './chat-resource.fn';

export function naturalLanguageResource<Output>(args: {
  input: Signal<string | null | undefined>;
  model: SignalLike<string>;
  description: SignalLike<string>;
  temperature?: SignalLike<number>;
  maxTokens?: SignalLike<number>;
  outputSchema: SignalLike<ZodSchema<Output>>;
  examples?: SignalLike<{ input: string; output: Output }[]>;
}) {
  const description = computed(() =>
    typeof args.description === 'string' ? args.description : args.description()
  );
  const examples = computed(() =>
    args.examples === undefined
      ? []
      : Array.isArray(args.examples)
      ? args.examples
      : args.examples()
  );
  const outputSchema = computed((): ZodSchema<Output> => {
    return typeof args.outputSchema === 'function'
      ? args.outputSchema()
      : args.outputSchema;
  });
  const systemMessage = computed((): SystemMessage => {
    return {
      role: 'system',
      content: `
      You are an AI that generates structured output based on natural language input.
      The input will be provided. Your response must match the output 
      schema. There is no reason to include any other text in your response. 
      Do not call any tools. Just respond with the output in the schema.

      Here's a more detailed description of what you are predicting:
      ${description()}

      Here are examples:
      ${examples()
        .map(
          (example) => `
        Input: ${example.input}
        Output: ${example.output}
      `
        )
        .join('\n')}
    `,
    };
  });

  const chat = chatResource({
    model: args.model,
    temperature: args.temperature,
    maxTokens: args.maxTokens,
    messages: [systemMessage()],
    responseFormat: args.outputSchema,
  });

  const output = computed((): { result: Output } | { error: string } => {
    const messages = chat.messages();
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) {
      return { error: 'No response from the model' };
    }

    if (lastMessage.role !== 'assistant') {
      return { error: 'No response from the model' };
    }

    try {
      const result = outputSchema().parse(
        JSON.parse(lastMessage.content ?? '{}')
      );
      return { result };
    } catch (error) {
      return {
        error:
          error instanceof ZodError
            ? error.message
            : 'Invalid response from the model',
      };
    }
  });

  const error = computed(() => {
    const outputValue = output();
    if ('error' in outputValue) {
      return outputValue.error;
    }
    return null;
  });

  const result = computed(() => {
    const outputValue = output();
    if ('result' in outputValue) {
      return outputValue.result;
    }
    return null;
  });

  const isPredicting = computed(() => {
    return chat.isSending() || chat.isReceiving();
  });

  effect(() => {
    const currentInput = args.input();

    if (!currentInput) {
      return;
    }

    chat.setMessages([
      systemMessage(),
      { role: 'user', content: currentInput },
    ]);
  });

  return {
    error,
    result,
    isPredicting,
  };
}
