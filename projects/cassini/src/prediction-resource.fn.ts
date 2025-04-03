import { Signal, effect, computed } from '@angular/core';
import { chatResource } from './chat-resource.fn';
import { SignalLike, SystemMessage } from './types';
import { BoundTool, createTool } from './create-tool.fn';
import { s } from './schema';

export function predictionResource<
  Input,
  OutputSchema extends s.AnyType
>(args: {
  model: string;
  temperature?: number;
  maxTokens?: number;
  input: Signal<Input | null | undefined>;
  description: SignalLike<string>;
  outputSchema: OutputSchema;
  examples?: { input: Input; output: s.Infer<OutputSchema> }[];
  tools?: SignalLike<BoundTool[]>;
  signals?: {
    [key: string]: {
      signal: Signal<any>;
      description: string;
    };
  };
}): {
  output: Signal<s.Infer<OutputSchema> | null>;
  isPredicting: Signal<boolean>;
} {
  const description = computed(() => {
    return typeof args.description === 'string'
      ? args.description
      : args.description();
  });
  const readStateTool = createTool({
    name: 'readState',
    description: 'Read the state of the system',
    schema: s.object('Read the state of the system', {
      name: s.string('The name of the state'),
    }),
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
      ${(args.examples as unknown as { input: object; output: object }[])
        ?.map(
          (example: { input: object; output: object }) => `
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

  const output = computed((): s.Infer<OutputSchema> | null => {
    const messages = chat.messages();
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) {
      return null;
    }

    if (lastMessage.role !== 'assistant') {
      return null;
    }

    try {
      return (s.parse as any)(
        args.outputSchema as unknown,
        JSON.parse(lastMessage.content ?? '{}')
      );
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
