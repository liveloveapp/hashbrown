import { Chat, s } from '@hashbrownai/core';
import { ChatInterface, ChatOptions, useChat } from './use-chat';

export interface StructuredChatOptions<
  ResponseSchema extends Chat.ResponseFormat,
> extends ChatOptions {
  /**
   * The output schema for the predictions.
   */
  responseSchema: ResponseSchema;
}

export interface StructuredChatInterface<
  ResponseSchema extends Chat.ResponseFormat,
> extends ChatInterface {
  structuredOutput: s.Infer<ResponseSchema>;
}

export const useStructuredChat = <ResponseSchema extends Chat.ResponseFormat>(
  options: StructuredChatOptions<ResponseSchema>,
): StructuredChatInterface<ResponseSchema> => {
  const chat = useChat(options);

  const parseOutput = () => {
    const lastMessage = chat.messages[chat.messages.length - 1];

    if (!lastMessage || lastMessage.role !== 'assistant') {
      return undefined;
    }

    try {
      return s.parse(
        options.responseSchema,
        JSON.parse(lastMessage.content ?? '{}'),
      );
    } catch (error) {
      return undefined;
    }
  };

  const structuredOutput = parseOutput();

  return {
    ...chat,
    structuredOutput,
  };
};
