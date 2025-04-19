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

    console.log('toolCalls', toolCalls);

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
          // @todo U.G. Wilson - as the tool message is built off the stream
          // we get SyntaxError: Unexpected end of JSON input errors
          // until the tool message is completely composed.
          // This happens because onChunk is setting prevMessages as the
          // tool message is being composed instead of waiting for the
          // tool message to be completely composed.  This is slightly desired
          // because it allows the assistant text to respond as a stream.
          s.parse(tool.schema, JSON.parse(toolCall.function.arguments)),
        ),
      );
    });

    const results = await Promise.all(toolCallResults);

    const toolMessages: Chat.ToolMessage[] = toolCalls.map(
      (toolCall, index) => ({
        role: 'tool',
        content: {
          type: 'success',
          // @todo U.G. Wilson - Make sure this object can be serialized to JSON.
          content: results[index] as object,
        },
        tool_call_id: toolCall.id,
        tool_name: toolCall.function.name,
      }),
    );

    // @todo U.G. Wilson - implement the error serialization implied by the
    // angular implementation to feed back tool calls with error results
    // back to the LLM.

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
    // @todo U.G. Wilson - figure out the interaction modality here. Should I let
    // the error escape for ErrorBoundaries to handle or should I provide a callback
    // to the developer or is there another preferred pattern?
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
