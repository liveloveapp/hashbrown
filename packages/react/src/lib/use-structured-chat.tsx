import { s } from './schema';
import { ChatInterface, ChatOptions, useChat } from './use-chat';

export interface StructuredChatOptions extends ChatOptions {
  outputSchema: s.AnyType;
}

export const useStructuredChat = (
  options: StructuredChatOptions,
): ChatInterface => {
  const chat = useChat(options);

  return {
    ...chat,
  };
};
