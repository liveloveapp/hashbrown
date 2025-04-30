import { Chat, s, Tater } from '@hashbrownai/core';
import { useChat, UseChatOptions, UseChatResult } from './use-chat';
import { useMemo } from 'react';

export interface UseStructuredChatOptions<Output extends Chat.ResponseFormat>
  extends UseChatOptions {
  /**
   * The output schema for the predictions.
   */
  output: Output;
}

export interface UseStructuredChatResult<Output extends Chat.ResponseFormat>
  extends Omit<UseChatResult, 'messages'> {
  messages: Chat.Message<s.Infer<Output>>[];
  output: s.HashbrownType | undefined;
  setOutput: (output: s.HashbrownType | undefined) => void;
}

export const useStructuredChat = <Output extends Chat.ResponseFormat>({
  output,
  ...options
}: UseStructuredChatOptions<Output>): UseStructuredChatResult<Output> => {
  const chat = useChat({
    ...options,
    θoutput: output,
  });

  const parsedMessages = useMemo(() => {
    return chat.messages.reduce(
      (acc, message) => {
        if (message.role === 'assistant' && message.content) {
          const streamParser = new Tater.StreamSchemaParser(output);

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
  }, [chat.messages, output]);

  return {
    ...chat,
    messages: parsedMessages,
    output: chat.θoutput,
    setOutput: chat.θsetOutput,
  };
};
