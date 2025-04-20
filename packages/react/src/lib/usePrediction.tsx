import { Chat } from '@hashbrownai/core';
import { ReactNode, useEffect, useState } from 'react';
import { useChat } from './ChatProvider';
import { BoundTool } from './create-tool.fn';
import { s } from './schema';
type ResponseSchema = s.ObjectType<Record<string, s.AnyType>>;

export const usePrediction = (
  predictionPrompt: string,
  tools?: BoundTool<string, any>[],
  //outputSchema: ResponseSchema,
  examples?: { input: string; output: s.Infer<ResponseSchema> }[],
  componentBuilder?: (props: { text: string }) => ReactNode,
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
    console.log('input', input);
    stop();

    setMessages([systemMessage as Chat.Message]);
    sendMessage({ role: 'user', content: input });
  }, [input]);

  const predictionComponents = componentBuilder ? (
    <>
      {componentBuilder({ text: 'First prediction' })}
      {componentBuilder({ text: 'Second prediction' })}
      {componentBuilder({ text: 'Third prediction' })}
    </>
  ) : null;

  return {
    setInput,
    predictionComponents,
    isThinking,
    stop,
  };
};
