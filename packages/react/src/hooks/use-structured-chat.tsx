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
            console.log(message);
            // const parsedContent = s.parse(
            //   output,
            //   message.content ? message.content : {},
            // );

            // console.log(parsedContent);
            acc.push({
              ...message,
              content: message.content ? message.content : {},
            });
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
          } catch (error) {
            console.log(error);
            // Do nothing for right now
          }
        } else {
          acc.push(message);
        }
        return acc;
      },
      [] as Chat.Message<s.Infer<Output>>[],
    );
  }, [chat.messages]);

  return {
    ...chat,
    messages: parsedMessages,
  };
};
