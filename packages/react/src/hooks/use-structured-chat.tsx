import { Chat, s, Tater } from '@hashbrownai/core';

import { ChatStatus, useChat, UseChatOptions } from './use-chat';
import { useMemo } from 'react';

export interface StructuredChatOptions<Output extends Chat.ResponseFormat>
  extends UseChatOptions {
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
  stop: () => void;
  reload: () => void;
  output: s.HashbrownType | undefined;
  setOutput: (output: s.HashbrownType | undefined) => void;
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
          console.log(message);
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
