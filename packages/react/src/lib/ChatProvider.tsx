import { Chat } from '@hashbrownai/core';
import { updateMessagesWithDelta } from '@hashbrownai/utilities';
import { createContext, useContext, useEffect, useState } from 'react';
import { BoundTool } from './create-tool.fn';
import { s } from './schema';
import { streamChatCompletionWithTools } from './stream-fetch.fn';

// TODO: Handling isSending and isReceiving.

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
}

/**
 * Creates OpenAI tool definitions from the provided tools.
 *
 * @param tools - The list of tools from configuration.
 * @returns An array of tool definitions for the chat completion.
 */
function createToolDefinitions(
  tools: BoundTool<string, s.ObjectType<Record<string, s.AnyType>>>[] = [],
): Chat.Tool[] {
  return tools.map((boundTool): Chat.Tool => boundTool.toTool());
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

  // TODO: Probably swap this to a reducer; it's working for now.
  const [prevMessages, setPrevMessages] = useState<Chat.Message[]>(
    messages ?? [],
  );

  const processToolCallMessage = async (message: Chat.AssistantMessage) => {
    const toolCalls = message.tool_calls;

    if (!toolCalls) return;

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

    /// !!!!!!!!!!!!!!!!!!!!!
    // PICKUP HERE!!!!
    // The tool information is being stored in results.
    // Need to push it onto the message list and get the answer back from the LLM to
    // continue the conversation.
    // There are reactivity challenges here that need to be overcome correctly.
    // !!!!!!!!!!!!!!!!!!!!!

    const results = await Promise.all(toolCallResults);
    console.log('processToolCallMessage', results);
    return results;
  };

  useEffect(() => {
    processToolCallMessage(
      prevMessages[prevMessages.length - 1] as Chat.AssistantMessage,
    );
  }, [prevMessages]);

  const onChunk = (chunk: Chat.CompletionChunk) => {
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
    // TODO: fill this out via callbacks or otherwise look up how a react package would handles
    console.error(error);
  };

  const sendMessage = (message: Chat.Message) => {
    setPrevMessages((prevMessages) => [...prevMessages, message]);

    // TODO: Catch the abort and expose it for stopping the stream.
    streamChatCompletionWithTools({
      url: 'http://localhost:3000/chat',
      request: {
        model,
        temperature,
        tools: createToolDefinitions(tools),
        max_tokens: maxTokens,
        response_format: responseFormat as Chat.ResponseFormat,
        messages: [...prevMessages, message],
      },
      callbacks: {
        onChunk,
        onError,
      },
    });
  };

  return (
    <ChatContext.Provider value={{ messages: prevMessages, sendMessage }}>
      {props.children}
    </ChatContext.Provider>
  );
};
