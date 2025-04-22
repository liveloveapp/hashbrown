import { ChatOptions, useChat } from './use-chat';

export interface UiChatOptions extends ChatOptions {
  components: React.ComponentType<any>[];
}

export const useUiChat = (options: UiChatOptions) => {
  const chat = useChat(options);

  return {
    ...chat,
  };
};
