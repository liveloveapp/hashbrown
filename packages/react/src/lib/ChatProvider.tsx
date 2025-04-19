import { Chat } from '@hashbrownai/core';
import { updateMessagesWithDelta } from '@hashbrownai/utilities';
import { createContext, useContext, useEffect, useState } from 'react';
import { BoundTool } from './create-tool.fn';
import { s } from './schema';
import { streamChatCompletionWithTools } from './stream-fetch.fn';
import { createToolDefinitions } from './utilities';

export interface ChatProviderProps {
  model: string;
  temperature?: number;
  tools?: BoundTool<string, any>[];
  maxTokens?: number;
  responseFormat?: s.AnyType;
  messages?: Chat.Message[];
}

export interface ChatProviderContext {
  messages: Chat.Message[];
  sendMessage: (message: Chat.Message) => void;
  isThinking: boolean;
  stop: () => void;
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
  const { model, temperature, tools, maxTokens, responseFormat, messages } =
    props;

  const [prevMessages, setPrevMessages] = useState<Chat.Message[]>(
    messages ?? [],
  );

  const [isThinking, setIsThinking] = useState<boolean>(false);
  const [abortFn, setAbortFn] = useState<(() => void) | null>(null);

  const processToolCallMessage = async (message: Chat.AssistantMessage) => {
    if (!message || !message.tool_calls) return;

    const toolCalls = message.tool_calls;

    // @todo U.G. Wilson - there is next to zero error handling here nor
    // validation that this is a json serializable object.
    // Cheat off Mike's homework when he's done.
    const toolCallResults = toolCalls.map((toolCall) => {
      const tool = tools?.find((t) => t.name === toolCall.function.name);
      if (!tool) {
        throw new Error(`Tool ${toolCall.function.name} not found`);
      }

      return tool.handler(
        s.parse(
          tool.schema,
          s.parse(tool.schema, JSON.parse(toolCall.function.arguments)),
        ),
      );
    });

    const results = await Promise.all(toolCallResults);

    // @todo U.G. Wilson - there is next to zero error handling here nor
    const toolMessages: Chat.ToolMessage[] = toolCalls.map(
      (toolCall, index) => ({
        role: 'tool',
        content: {
          type: 'success',
          content: results[index] as object,
        },
        tool_call_id: toolCall.id,
        tool_name: toolCall.function.name,
      }),
    );

    sendMessages([...toolMessages]);
  };

  useEffect(() => {
    const lastMessage = prevMessages[prevMessages.length - 1];

    if (
      lastMessage &&
      lastMessage.role === 'assistant' &&
      lastMessage.tool_calls &&
      lastMessage.tool_calls.length > 0
    ) {
      processToolCallMessage(lastMessage as Chat.AssistantMessage);
    }
  }, [prevMessages]);

  const onChunk = (chunk: Chat.CompletionChunk) => {
    setIsThinking(true);

    setPrevMessages((prevMessages) => {
      const updatedMessages = chunk.choices
        .map((choice: Chat.CompletionChunk['choices'][number]) =>
          updateMessagesWithDelta(prevMessages, choice.delta as Chat.Message),
        )
        .flat();
      return updatedMessages;
    });
  };

  const onError = (error: Error) => {
    setIsThinking(false);
    // TODO: fill this out via callbacks or otherwise look up how a react package would handles
    console.error(error);
  };

  const onComplete = () => {
    setIsThinking(false);
  };

  const sendMessages = (messages: Chat.Message[]) => {
    setIsThinking(true);
    setPrevMessages((prevMessages) => [...prevMessages, ...messages]);

    const abort = streamChatCompletionWithTools({
      url: 'http://localhost:3000/chat',
      request: {
        model,
        temperature,
        tools: createToolDefinitions(tools),
        max_tokens: maxTokens,
        response_format: responseFormat as Chat.ResponseFormat,
        messages: [...prevMessages, ...messages],
      },
      callbacks: {
        onChunk,
        onError,
        onComplete,
      },
    });

    setAbortFn(() => abort);
  };

  const sendMessage = (message: Chat.Message) => {
    sendMessages([message]);
  };

  const stop = () => {
    if (abortFn) {
      abortFn();
      setAbortFn(null);
      setIsThinking(false);
    }
  };

  return (
    <ChatContext.Provider
      value={{ messages: prevMessages, sendMessage, isThinking, stop }}
    >
      {props.children}
    </ChatContext.Provider>
  );
};
