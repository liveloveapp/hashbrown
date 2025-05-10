import { Chat, s, Tater } from '@hashbrownai/core';
import { useMemo } from 'react';
import { useChat, UseChatOptions, UseChatResult } from './use-chat';

export interface UseStructuredChatOptions<Output extends Chat.ResponseFormat>
  extends UseChatOptions {
  /**
   * The output schema for the predictions.
   */
  schema: s.HashbrownType;
}

export interface UseStructuredChatResult<Output extends Chat.ResponseFormat>
  extends Omit<UseChatResult, 'messages'> {
  messages: Chat.Message<s.Infer<Output>>[];
  schema: s.HashbrownType | undefined;
  setSchema: (schema: s.HashbrownType | undefined) => void;
}

export const useStructuredChat = <Output extends Chat.ResponseFormat>({
  schema,
  ...options
}: UseStructuredChatOptions<Output>): UseStructuredChatResult<Output> => {
  const chat = useChat({
    ...options,
    θschema: schema,
  });

  const parsedMessages = useMemo(() => {
    return chat.messages.reduce(
      (acc, message) => {
        if (message.role === 'assistant' && message.content) {
          const streamParser = new Tater.StreamSchemaParser(schema);

          try {
            const streamResult = streamParser.parse(message.content);

            acc.push({ ...message, content: streamResult });
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
          } catch (error) {
            // Do nothing for right now
          }
        } else {
          acc.push(message);
        }
        return acc;
      },
      [] as Chat.Message<s.Infer<Output>>[],
    );
  }, [chat.messages, schema]);

  return {
    ...chat,
    messages: parsedMessages,
    schema: chat.θschema,
    setSchema: chat.θsetSchema,
  };
};
