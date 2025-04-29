import { Chat, s } from '@hashbrownai/core';
import { useContext, useEffect, useState } from 'react';
import { BoundTool } from './create-tool.fn';
import { HashbrownContext } from './hashbrown-provider';
import { streamChatCompletionWithTools } from './stream-fetch.fn';
import { createToolDefinitions, updateMessagesWithDelta } from './utilities';

export enum ChatStatus {
  Sending,
  Receiving,
  Idle,
  Error,
}

export interface ChatOptions {
  /**
   * The LLM model to use for the chat.
   */
  model: string;
  /**
   * The initial messages for the chat.
   * default: 1.0
   */
  messages?: Chat.Message[];
  /**
   * The tools to make available use for the chat.
   * default: []
   */
  tools?: BoundTool<string, any>[];
  /**
   * The output schema for the chat.
   * default: undefined
   */
  responseSchema?: s.HashbrownType;
  /**
   * The temperature for the chat.
   */
  temperature?: number;
  /**
   * The maximum number of tokens to allow.
   * @todo U.G. Wilson - this is unimplemented.
   * default: 5000
   */
  maxTokens?: number;
  /**
   * The debounce time between sends to the endpoint.
   * @todo U.G. Wilson - this is unimplemented.
   * default: 150
   */
  debounceTime?: number;
}

export interface ChatInterface {
  messages: Chat.Message[];
  setMessages: (messages: Chat.Message[]) => void;
  sendMessage: (message: Chat.Message) => void;
  status: ChatStatus;
  error: Error | null;
  isReloading: boolean;
  stop: () => void;
}

export const useChat = ({
  model,
  messages: initialMessages,
  tools: initialTools,
  responseSchema: initialResponseSchema,
  temperature = 1.0,
  maxTokens = 5000,
  debounceTime = 150,
}: ChatOptions): ChatInterface => {
  const context = useContext(HashbrownContext);

  if (!context) {
    throw new Error('useChat must be used within a HashbrownProvider');
  }

  const [messages, setMessages] = useState<Chat.Message[]>(
    initialMessages ?? [],
  );

  const [tools, setTools] = useState<BoundTool<string, any>[]>(
    initialTools ?? [],
  );
  const [responseSchema, setResponseSchema] = useState<
    s.HashbrownType | undefined
  >(initialResponseSchema);

  const [status, setStatus] = useState<ChatStatus>(ChatStatus.Idle);
  const [error, setError] = useState<Error | null>(null);

  const [abortFn, setAbortFn] = useState<(() => void) | null>(null);

  const sendMessages = (newMessages: Chat.Message[]) => {
    console.debug('Sending messages', [...messages, ...newMessages]);

    setStatus(ChatStatus.Sending);
    setMessages((messages) => [...messages, ...newMessages]);

    const onChunk = (chunk: Chat.CompletionChunk) => {
      setStatus(ChatStatus.Receiving);

      setMessages((messages) => {
        const updatedMessages = chunk.choices
          .map((choice: Chat.CompletionChunk['choices'][number]) =>
            updateMessagesWithDelta(messages, choice.delta as Chat.Message),
          )
          .flat();

        return updatedMessages;
      });
    };

    const onError = (error: Error) => {
      setStatus(ChatStatus.Error);
      setError(error);
    };

    const onComplete = () => {
      setStatus(ChatStatus.Idle);
    };

    const abort = streamChatCompletionWithTools({
      url: context.url,
      headers: context.headers ?? {},
      request: {
        model,
        temperature,
        tools: createToolDefinitions(tools),
        max_tokens: maxTokens,
        response_format: responseSchema
          ? s.toJsonSchema(responseSchema)
          : undefined,
        messages: [...messages, ...newMessages],
      },
      callbacks: {
        onChunk,
        onError,
        onComplete,
      },
    });

    setAbortFn(() => abort);
  };

  const processToolCallMessage = async (message: Chat.AssistantMessage) => {
    /**
     * @todo U.G. Wilson - this whole function is a mess.
     */
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
    const lastMessage = messages[messages.length - 1];

    if (
      lastMessage &&
      lastMessage.role === 'assistant' &&
      lastMessage.tool_calls &&
      lastMessage.tool_calls.length > 0
    ) {
      processToolCallMessage(lastMessage as Chat.AssistantMessage);
    }
  }, [messages]);

  const sendMessage = (message: Chat.Message) => {
    sendMessages([message]);
  };

  const stop = () => {
    if (abortFn) {
      abortFn();
      setAbortFn(null);
    }
  };

  console.debug('messages', messages);

  return {
    messages,
    setMessages,
    sendMessage,
    status,
    error,
    isReloading: false,
    stop,
  };
};
