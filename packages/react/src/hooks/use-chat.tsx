/* eslint-disable @typescript-eslint/no-explicit-any */
import { Chat, generateNextMessage, s } from '@hashbrownai/core';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { BoundTool } from '../create-tool.fn';
import { HashbrownContext } from '../hashbrown-provider';
import { createToolDefinitions, updateMessagesWithDelta } from '../utilities';

/**
 * The status of the chat.
 */
export enum ChatStatus {
  /**
   * The chat is idle.
   */
  Idle,

  /**
   * The client is sending a message to the
   * server.
   */
  Sending,

  /**
   * The client is receiving a response from
   * the server, typically while streaming.
   */
  Receiving,

  /**
   * An error occurred while sending or receiving
   * a message.
   */
  Error,
}

/**
 * Options for the `useChat` hook.
 */
export interface UseChatOptions {
  /**
   * The LLM model to use for the chat.
   *
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
   * @internal
   */
  θschema?: s.HashbrownType;

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

/**
 * Represents the result of the `useChat` hook.
 */
export interface UseChatResult {
  /**
   * An array of chat messages.
   */
  messages: Chat.Message[];

  /**
   * Function to update the chat messages.
   * @param messages - The new array of chat messages.
   */
  setMessages: (messages: Chat.Message[]) => void;

  /**
   * Function to send a new chat message.
   * @param message - The chat message to send.
   */
  sendMessage: (message: Chat.Message) => void;

  /**
   * Reload the chat, useful for retrying when an error occurs.
   */
  reload: () => void;

  /**
   * The current status of the chat.
   */
  status: ChatStatus;

  /**
   * The error encountered during chat operations, if any.
   */
  error: Error | null;

  /**
   * Function to stop the current chat operation.
   */
  stop: () => void;

  /**
   * Function to update the tools available for the chat.
   * @param tools - The new array of tools.
   */
  setTools: (tools: BoundTool<string, any>[]) => void;

  /**
   * Function to set the output schema for the chat.
   * @param schema - The new output schema or undefined.
   * @internal
   */
  θsetSchema: (schema: s.HashbrownType | undefined) => void;

  /**
   * The output schema for the chat.
   */
  θschema: s.HashbrownType | undefined;
}

/**
 * Custom React hook to manage chat interactions within a HashbrownProvider context.
 * This hook provides functionalities to send messages, handle tool calls, and manage chat status.
 *
 * @param {UseChatOptions} options - Configuration options for the chat.
 * @returns {UseChatResult} An object containing chat state and functions to interact with the chat.
 *
 * @example
 * ```tsx
 * const MyChatComponent = () => {
 *   const { messages, sendMessage, status } = useChat({
 *     model: 'gpt-4o',
 *     messages: [
 *       {
 *         role: 'system',
 *         content: 'You are a helpful assistant.',
 *       },
 *     ],
 *     tools: [],
 *   });
 *
 *   const handleSendMessage = () => {
 *     sendMessage({ role: 'user', content: 'Hello, how are you?' });
 *   };
 *
 *   return (
 *     <div>
 *       <button onClick={handleSendMessage}>Send Message</button>
 *       <div>Status: {status}</div>
 *       <ul>
 *         {messages.map((msg, index) => (
 *           <li key={index}>{msg.content}</li>
 *         ))}
 *       </ul>
 *     </div>
 *   );
 * };
 * ```
 */
export const useChat = (options: UseChatOptions): UseChatResult => {
  const {
    model,
    messages: initialMessages,
    tools: initialTools,
    θschema: initialSchema,
    temperature,
    maxTokens,
    debounceTime = 150,
  } = options;
  const context = useContext(HashbrownContext);

  if (!context) {
    throw new Error('useChat must be used within a HashbrownProvider');
  }

  const [nonStreamingMessages, setMessages] = useState<Chat.Message[]>(
    initialMessages ?? [],
  );
  /**
   * This is a temporary state container for the message that is currently
   * being streamed into the chat. It's held in a container to prevent the
   * useEffect call responsible for generating the next message from re-running
   * when the streaming message is updated.
   */
  const [streamingMessage, setStreamingMessage] = useState<Chat.Message | null>(
    null,
  );
  const [tools, setTools] = useState<BoundTool<string, any>[]>(
    initialTools ?? [],
  );
  const [schema, setSchema] = useState<s.HashbrownType | undefined>(
    initialSchema,
  );
  const [status, setStatus] = useState<ChatStatus>(ChatStatus.Idle);
  const [error, setError] = useState<Error | null>(null);
  const [abortFn, setAbortFn] = useState<(() => void) | null>(null);

  useEffect(() => {
    const lastMessage = nonStreamingMessages[nonStreamingMessages.length - 1];
    const needsToSendMessage =
      lastMessage &&
      (lastMessage.role === 'user' || lastMessage.role === 'tool');

    if (!needsToSendMessage) return;

    const abortController = new AbortController();
    const abortFn = () => abortController.abort();

    setAbortFn(() => abortFn);

    (async () => {
      setStatus(ChatStatus.Sending);

      await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          resolve(undefined);
        }, debounceTime);

        abortController.signal.addEventListener('abort', () =>
          clearTimeout(timeoutId),
        );
      });

      let _streamingMessage: Chat.Message | null = null;

      const onChunk = (chunk: Chat.CompletionChunk) => {
        setStatus(ChatStatus.Receiving);

        if (!chunk.choices || !chunk.choices[0]) {
          return;
        }

        _streamingMessage = updateMessagesWithDelta(
          _streamingMessage,
          chunk.choices[0].delta as Chat.Message,
        );

        setStreamingMessage(_streamingMessage);
      };

      const onError = (error: Error) => {
        setStatus(ChatStatus.Error);
        setError(error);
      };

      const onComplete = () => {
        setStatus(ChatStatus.Idle);
        setMessages((messages) => {
          if (_streamingMessage) {
            return [...messages, _streamingMessage];
          }
          return messages;
        });
        setStreamingMessage(null);
      };

      try {
        for await (const chunk of generateNextMessage({
          apiUrl: context.url,
          middleware: context.middleware ?? [],
          abortSignal: abortController.signal,
          fetchImplementation: window.fetch.bind(window),
          model,
          temperature,
          tools: createToolDefinitions(tools),
          maxTokens,
          responseFormat: schema,
          messages: nonStreamingMessages,
        })) {
          onChunk(chunk);
        }
        onComplete();
      } catch (error) {
        console.log('error', error);
        onError(error as Error);
      }
    })();

    return abortFn;
  }, [
    context.middleware,
    context.url,
    maxTokens,
    nonStreamingMessages,
    model,
    schema,
    temperature,
    tools,
    debounceTime,
  ]);

  const processToolCallMessage = useCallback(
    async (message: Chat.AssistantMessage) => {
      if (!message || !message.tool_calls) return;

      const toolCalls = message.tool_calls;

      const toolCallResults = toolCalls.map((toolCall) => {
        const tool = tools?.find((t) => t.name === toolCall.function.name);

        if (!tool) {
          throw new Error(`Tool ${toolCall.function.name} not found`);
        }

        const args = s.parse(
          tool.schema,
          JSON.parse(toolCall.function.arguments),
        );

        return tool.handler(args);
      });

      const results = await Promise.allSettled(toolCallResults);

      const toolMessages: Chat.ToolMessage[] = toolCalls.map(
        (toolCall, index) => ({
          role: 'tool',
          content: results[index],
          tool_call_id: toolCall.id,
          tool_name: toolCall.function.name,
        }),
      );

      setMessages((messages) => [...messages, ...toolMessages]);
    },
    [tools],
  );

  useEffect(() => {
    const lastMessage = nonStreamingMessages[nonStreamingMessages.length - 1];

    if (
      lastMessage &&
      lastMessage.role === 'assistant' &&
      lastMessage.tool_calls &&
      lastMessage.tool_calls.length > 0
    ) {
      processToolCallMessage(lastMessage as Chat.AssistantMessage);
    }
  }, [nonStreamingMessages, processToolCallMessage]);

  const messages = useMemo(() => {
    if (streamingMessage) {
      return [...nonStreamingMessages, streamingMessage];
    }
    return nonStreamingMessages;
  }, [nonStreamingMessages, streamingMessage]);

  const sendMessage = useCallback(
    (message: Chat.Message) => {
      if (status === ChatStatus.Sending || status === ChatStatus.Receiving) {
        throw new Error(
          'Cannot send message while sending or receiving. If this was intentional, call chat.stop() first.',
        );
      }

      setMessages((messages) => [...messages, message]);
    },
    [status, setMessages],
  );

  const stop = useCallback(() => {
    if (abortFn) {
      abortFn();
      setAbortFn(null);
    }
  }, [abortFn]);

  const reload = useCallback(() => {
    stop();

    setMessages((messages) => {
      if (messages.length === 0) return messages;

      const lastMessage = messages[messages.length - 1];

      if (lastMessage.role === 'assistant') {
        return messages.slice(0, messages.length - 1);
      }

      return messages;
    });
  }, [setMessages, stop]);

  // useEffect(() => {
  //   console.log('messages', messages);
  // }, [messages]);

  return {
    messages,
    setMessages,
    sendMessage,
    status,
    error,
    reload,
    stop,
    setTools,
    θsetSchema: setSchema,
    θschema: schema,
  };
};
