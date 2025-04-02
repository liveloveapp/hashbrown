import { Signal, effect, computed } from '@angular/core';
import { z, ZodSchema } from 'zod';
import { chatResource } from './chat-resource.fn';
import { SignalLike, SystemMessage } from './types';
import { BoundTool, createTool } from './create-tool.fn';

export function predictionResource<Input, Output>(args: {
  model: string;
  temperature?: number;
  maxTokens?: number;
  input: Signal<Input | null | undefined>;
  description: SignalLike<string>;
  outputSchema: ZodSchema<Output>;
  examples?: { input: Input; output: Output }[];
  tools?: SignalLike<BoundTool[]>;
  signals?: {
    [key: string]: {
      signal: Signal<any>;
      description: string;
    };
  };
}) {
  const description = computed(() => {
    return typeof args.description === 'string'
      ? args.description
      : args.description();
  });
  const readStateTool = createTool({
    name: 'readState',
    description: 'Read the state of the system',
    schema: z.object({
      name: z.string(),
    }) as any,
    handler: async (input) => {
      const signal = args.signals?.[input.name];
      if (!signal) {
        throw new Error(`Signal ${input.name} not found`);
      }
      return {
        [input.name]: signal.signal(),
      };
    },
  });
  const signalsInstructions = computed(() => {
    const signals = args.signals;

    if (!signals) {
      return '';
    }

    const definitions = Object.entries(signals)
      .map(([key, { description }]) => ` - ${key}: ${description}`)
      .join('\n');

    return `
      You can read state of the system by calling the "readState" function with
      name of the state you want to read. It will return the current value of
      that state.

      Here is the state of the system:
      ${definitions}
    `;
  });
  const systemMessage = computed((): SystemMessage => {
    return {
      role: 'system',
      content: `
      You are an AI that predicts the output based on the input.
      The input will be provided. Your response must match the output 
      schema. There is no reason to include any other text in your response. 

      Here's a more detailed description of what you are predicting:
      ${description()}

      ${signalsInstructions()}

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
  const tools = computed(() =>
    Array.isArray(args.tools)
      ? args.tools
      : args.tools === undefined
      ? []
      : args.tools()
  );
  const chat = chatResource({
    model: args.model,
    temperature: args.temperature,
    maxTokens: args.maxTokens,
    messages: [systemMessage()],
    responseFormat: args.outputSchema,
    tools: [...tools(), ...(args.signals ? [readStateTool] : [])],
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
