import { Chat, s } from '@hashbrownai/core';
import { useEffect } from 'react';
import { ChatInterface, ChatOptions, useChat } from './use-chat';

export interface StructuredChatOptions<OutputSchema extends Chat.ResponseFormat>
  extends ChatOptions {
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
  /**
   * The output schema for the predictions.
   */
  outputSchema: OutputSchema;
}

export interface StructuredChatInterface<
  OutputSchema extends Chat.ResponseFormat,
> extends ChatInterface {
  predictions: s.Infer<OutputSchema>;
}

export const useStructuredChat = <OutputSchema extends Chat.ResponseFormat>(
  options: StructuredChatOptions<OutputSchema>,
): StructuredChatInterface<OutputSchema> => {
  const chat = useChat(options);

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

  const parseOutput = () => {
    const lastMessage = chat.messages[chat.messages.length - 1];

    if (!lastMessage || lastMessage.role !== 'assistant') {
      return undefined;
    }

    try {
      return s.parse(
        options.outputSchema,
        JSON.parse(lastMessage.content ?? '{}'),
      );
    } catch (error) {
      return undefined;
    }
  };

  const predictions = parseOutput();

  console.log('predictions', predictions);

  return {
    ...chat,
    predictions,
  };
};
