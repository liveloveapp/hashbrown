import { Chat, s } from '@hashbrownai/core';
import { useEffect } from 'react';
import {
  StructuredChatInterface,
  StructuredChatOptions,
  useStructuredChat,
} from './use-structured-chat';
export interface PredictionOptions<OutputSchema extends Chat.ResponseFormat>
  extends StructuredChatOptions<OutputSchema> {
  /**
   * The input string to predict from.
   */
  input: string;
  /**
   * A more detailed description of what is to be predicted.
   */
  details?: string;
  /**
   * Example input and output pairs to guide the prediction.
   */
  examples?: { input: string; output: s.Infer<OutputSchema> }[];
}

export interface PredictionInterface<OutputSchema extends Chat.ResponseFormat>
  extends StructuredChatInterface<OutputSchema> {
  predictions: s.Infer<OutputSchema>;
}

export const usePrediction = <OutputSchema extends Chat.ResponseFormat>(
  options: PredictionOptions<OutputSchema>,
): PredictionInterface<OutputSchema> => {
  const chat = useStructuredChat(options);

  const systemPrompt = [
    'You are an AI that predicts the output based on the input.',
    'The input will be provided. Your response must match the output schema.',
    'There is no reason to include any other text in your response.\n',
    options.details
      ? `Here's a more detailed description of what you are predicting:\n ${options.details}\n`
      : '',
    options.examples
      ? `Here are examples:\n ${options.examples
          .map((example) =>
            [
              `Input: ${example.input}`,
              `Output: ${JSON.stringify(example.output)}`,
            ].join('\n'),
          )
          .join('\n')}`
      : '',
  ].join('\n');

  const systemMessage: Chat.SystemMessage = {
    role: 'system',
    content: systemPrompt,
  };

  useEffect(() => {
    console.log('input', options.input);
    if (!options.input) return;

    chat.stop();

    chat.setMessages([systemMessage as Chat.Message]);
    chat.sendMessage({ role: 'user', content: options.input });
  }, [options.input]);

  return {
    ...chat,
    predictions: chat.structuredOutput,
  };
};
