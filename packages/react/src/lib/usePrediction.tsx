import { Chat } from '@hashbrownai/core';
import { useEffect, useState } from 'react';
import { useChat } from './ChatProvider';
import { BoundTool } from './create-tool.fn';
import { s } from './schema';

type ResponseSchema = s.ObjectType<Record<string, s.AnyType>>;

export const usePrediction = (
  predictionPrompt: string,
  Component: React.ComponentType<any>,
  tools?: BoundTool<string, any>[],
  // @todo U.G. Wilson - get the responseFormat lowered to be configurable
  // by the usePrediction hook without causing an infinite loop.
  // Preferably, get to where you can hand in a Props interface for the
  // Component and have the responseFormat be derived from the Props.
  //outputSchema: ResponseSchema,
  examples?: { input: string; output: s.Infer<ResponseSchema> }[],
) => {
  const { messages, setMessages, sendMessage, isThinking, stop } = useChat();

  const [input, setInput] = useState('');

  const examplesSection = `
    Here are examples:
    ${examples
      ?.map(
        (example) => `
      Input: ${example.input}
      Output: ${JSON.stringify(example.output)}
    `,
      )
      .join('\n')}
  `;

  const systemMessage: Chat.SystemMessage = {
    role: 'system',
    content: `You are an AI that predicts the output based on the input.
The input will be provided. Your response must match the output
schema. There is no reason to include any other text in your response.

Here's a more detailed description of what you are predicting:
${predictionPrompt}

${examples ? examplesSection : ''}
`,
  };

  useEffect(() => {
    if (!input) return;

    stop();

    setMessages([systemMessage as Chat.Message]);
    sendMessage({ role: 'user', content: input });
  }, [input]);

  const parseOutput = () => {
    const lastMessage = messages[messages.length - 1];

    if (!lastMessage || lastMessage.role !== 'assistant') {
      return undefined;
    }

    try {
      return (s.parse as any)(
        s.object('Your response', {
          lights: s.array(
            'The lights to add to the scene',
            s.object('A join between a light and a scene', {
              lightId: s.string('the ID of the light to add'),
              brightness: s.number('the brightness of the light'),
            }),
          ),
        }) as unknown,
        JSON.parse(lastMessage.content ?? '{}'),
      );
    } catch (error) {
      return undefined;
    }
  };

  const output = parseOutput();

  const predictionComponents = output?.lights?.map(
    (light: { lightId: string; brightness: number }, index: number) => (
      <Component
        key={index}
        lightId={light.lightId}
        brightness={light.brightness}
      />
    ),
  );

  return {
    setInput,
    predictionComponents,
    isThinking,
    stop,
    output,
  };
};
