import { Chat } from '@hashbrownai/core';
import { updateMessagesWithDelta } from '@hashbrownai/utilities';
import { createContext, useContext, useState } from 'react';
import { BoundTool } from './create-tool.fn';
import { s } from './schema';
import { streamChatCompletionWithTools } from './stream-fetch.fn';

export interface ChatProviderProps {
  model: string;
  temperature?: number;
  tools?: BoundTool<string, any>[];
  maxTokens?: number;
  responseFormat?: s.AnyType;
}

export interface ChatProviderContext {
  messages: Chat.Message[];
  sendMessage: (message: Chat.Message) => void;
}

const ChatContext = createContext<ChatProviderContext | undefined>(undefined);

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};

export const ChatProvider = (
  props: ChatProviderProps & {
    children: React.ReactNode;
  },
) => {
  const { model, temperature, tools, maxTokens, responseFormat } = props;

  const [messages, setMessages] = useState<Chat.Message[]>([]);

  const onChunk = (chunk: Chat.CompletionChunk) => {
    console.log(chunk);
    setMessages((prevMessages) => {
      const updatedMessages = chunk.choices
        .map((choice: Chat.CompletionChunk['choices'][number]) =>
          updateMessagesWithDelta(prevMessages, choice.delta as Chat.Message),
        )
        .flat();
      return updatedMessages;
    });
  };

  const onComplete = () => {
    console.log('complete');
  };

  const onError = (error: Error) => {
    console.error(error);
  };

  const sendMessage = (message: Chat.Message) => {
    setMessages((prevMessages) => [...prevMessages, message]);

    streamChatCompletionWithTools({
      url: 'http://localhost:3000/chat',
      request: {
        model,
        temperature,
        max_tokens: maxTokens,
        response_format: responseFormat as Chat.ResponseFormat,
        messages: [...messages, message],
      },
      callbacks: {
        onChunk,
        onComplete,
        onError,
      },
    });
  };

  return (
    <ChatContext.Provider value={{ messages, sendMessage }}>
      {props.children}
    </ChatContext.Provider>
  );
};
