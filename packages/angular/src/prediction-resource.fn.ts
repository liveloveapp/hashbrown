import { computed, effect, Resource, Signal } from '@angular/core';
import { Chat, s } from '@hashbrownai/core';
import { chatResource } from './chat-resource.fn';
import { BoundTool, createToolWithArgs } from './create-tool.fn';
import { SignalLike } from './types';

export function predictionResource<
  Input,
  OutputSchema extends Chat.ResponseFormat,
>(args: {
  model: string;
  temperature?: number;
  maxTokens?: number;
  input: Signal<Input | null | undefined>;
  description: SignalLike<string>;
  outputSchema: OutputSchema;
  examples?: { input: Input; output: s.Infer<OutputSchema> }[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools?: SignalLike<BoundTool<string, any>[]>;
  signals?: {
    [key: string]: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      signal: Signal<any>;
      description: string;
    };
  };
}): Resource<s.Infer<OutputSchema> | undefined> {
  const description = computed(() => {
    return typeof args.description === 'string'
      ? args.description
      : args.description();
  });
  const readStateTool = createToolWithArgs({
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
  const examplesInstructions =
    args.examples && args.examples.length > 0
      ? `
    Here are examples of the input and output:

    ${(args.examples as unknown as { input: object; output: object }[])
      ?.map(
        (example: { input: object; output: object }) => `
        Input: ${JSON.stringify(example.input)}
        Output: ${JSON.stringify(example.output)}
      `,
      )
      .join('\n')}
  `
      : ``;
  const systemMessage = computed((): Chat.SystemMessage => {
    return {
      role: 'system',
      content: `
      You are an AI that predicts the output based on the input.
      The input will be provided. Your response must match the output
      schema. There is no reason to include any other text in your response.

      Here's a more detailed description of what you are predicting:
      ${description()}

      ${signalsInstructions()}

      ${examplesInstructions}
    `,
    };
  });
  const tools = computed(() =>
    Array.isArray(args.tools)
      ? args.tools
      : args.tools === undefined
        ? []
        : args.tools(),
  );
  const chat = chatResource({
    model: args.model,
    temperature: args.temperature,
    maxTokens: args.maxTokens,
    messages: [systemMessage()],
    responseFormat: args.outputSchema,
    tools: [...tools(), ...(args.signals ? [readStateTool] : [])],
  });

  const output = computed((): s.Infer<OutputSchema> | undefined => {
    const messages = chat.value();
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) {
      return undefined;
    }

    if (lastMessage.role !== 'assistant') {
      return undefined;
    }

    try {
      return s.parse(
        args.outputSchema,
        JSON.parse(lastMessage.content ?? '{}'),
      );
    } catch {
      return undefined;
    }
  });

  effect(() => {
    const currentInput = args.input();

    if (!currentInput) {
      return;
    }

    chat.set([
      systemMessage(),
      {
        role: 'user',
        content: JSON.stringify(currentInput),
      },
    ]);
  });

  function hasValue() {
    console.log('hasValue', output());
    return output() !== undefined;
  }

  const resource = {
    error: chat.error,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    hasValue: hasValue as any,
    isLoading: chat.isLoading,
    status: chat.status,
    value: output,
    reload: chat.reload,
  } satisfies Resource<unknown>;

  return resource as unknown as Resource<s.Infer<OutputSchema>>;
}
