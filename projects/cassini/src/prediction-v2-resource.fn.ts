import { linkedSignal, Signal, signal, effect, computed } from '@angular/core';
import { ZodSchema } from 'zod';
import { chatResource } from './chat-resource.fn';
import { SystemMessage } from './types';

export function predictionV2Resource<Input, Output>(args: {
  model: string;
  temperature?: number;
  maxTokens?: number;
  input: Signal<Input | null | undefined>;
  description: string;
  outputSchema: ZodSchema<Output>;
  examples?: { input: Input; output: Output }[];
}) {
  const systemMessage = computed((): SystemMessage => {
    return {
      role: 'system',
      content: `
      You are an AI that predicts the outputbased on the input.
      The input will be provided. Your response must match the output 
      schema. There is no reason to include any other text in your response. 
      Do not call any tools. Just respond with the output in the schema.

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
  });
  const chat = chatResource({
    model: args.model,
    temperature: args.temperature,
    maxTokens: args.maxTokens,
    messages: [systemMessage()],
    responseFormat: args.outputSchema,
  });

  const output = computed(() => {
    const messages = chat.messages();
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) {
      return null;
    }

    if (lastMessage.role !== 'assistant') {
      return null;
    }

    try {
      return args.outputSchema.parse(JSON.parse(lastMessage.content ?? '{}'));
    } catch (error) {
      return null;
    }
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
      {
        role: 'user',
        content: JSON.stringify(currentInput),
      },
    ]);
  });

  return {
    output,
    isPredicting,
  };
}
