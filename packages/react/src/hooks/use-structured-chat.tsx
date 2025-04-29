import { Chat, s } from '@hashbrownai/core';
import { ChatOptions, ChatStatus, useChat } from './use-chat';
import { useMemo } from 'react';

export interface StructuredChatOptions<Output extends Chat.ResponseFormat>
  extends ChatOptions {
  /**
   * The output schema for the predictions.
   */
  output: Output;
}

export interface StructuredChatInterface<Output extends Chat.ResponseFormat> {
  messages: Chat.Message<s.Infer<Output>>[];
  setMessages: (messages: Chat.Message[]) => void;
  sendMessage: (message: Chat.Message) => void;
  status: ChatStatus;
  error: Error | null;
  isReloading: boolean;
  stop: () => void;
}

export const useStructuredChat = <Output extends Chat.ResponseFormat>({
  output,
  ...options
}: StructuredChatOptions<Output>): StructuredChatInterface<Output> => {
  const chat = useChat({
    ...options,
    θoutput: output,
  });

  const parsedMessages = useMemo(() => {
    return chat.messages.reduce(
      (acc, message) => {
        if (message.role === 'assistant') {
          try {
            const parsedContent = s.parse(
              output,
              JSON.parse(message.content ?? '{}'),
            );
            acc.push({ ...message, content: parsedContent });
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
  };
};
