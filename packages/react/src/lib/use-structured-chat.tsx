import { Chat, s } from '@hashbrownai/core';
import { ChatInterface, ChatOptions, useChat } from './use-chat';

export interface StructuredChatOptions<OutputSchema extends Chat.ResponseFormat>
  extends ChatOptions {
  /**
   * The output schema for the predictions.
   */
  outputSchema: OutputSchema;
}

export interface StructuredChatInterface<
  OutputSchema extends Chat.ResponseFormat,
> extends ChatInterface {
  structuredOutput: s.Infer<OutputSchema>;
}

export const useStructuredChat = <OutputSchema extends Chat.ResponseFormat>(
  options: StructuredChatOptions<OutputSchema>,
): StructuredChatInterface<OutputSchema> => {
  const chat = useChat(options);

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

  const structuredOutput = parseOutput();

  return {
    ...chat,
    structuredOutput,
  };
};
