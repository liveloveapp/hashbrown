import { Chat, s } from '@hashbrownai/core';
import { useEffect, useMemo } from 'react';
import {
  StructuredChatInterface,
  StructuredChatOptions,
  useStructuredChat,
} from './use-structured-chat';

export interface PredictionOptions<OutputSchema extends Chat.ResponseFormat>
  extends Omit<StructuredChatOptions<OutputSchema>, 'messages'> {
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
  const { stop, setMessages, ...chat } = useStructuredChat(options);

  const systemPrompt = useMemo(
    () =>
      [
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
      ].join('\n'),
    [options.details, options.examples],
  );

  const systemMessage: Chat.SystemMessage = useMemo(() => {
    return {
      role: 'system',
      content: systemPrompt,
    };
  }, [systemPrompt]);

  useEffect(() => {
    console.log('input', options.input);
    if (!options.input) return;

    setMessages([
      systemMessage as Chat.Message,
      { role: 'user', content: options.input },
    ]);
  }, [setMessages, options.input, systemMessage]);

  return {
    ...chat,
    stop,
    setMessages,
    predictions: chat.messages
      .reverse()
      .find((message) => message.role === 'assistant')?.content,
  };
};
