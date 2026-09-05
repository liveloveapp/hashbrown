import {
  Chat,
  type ChatRuntime,
  createChatRuntime,
  s,
  type TransportOrFactory,
} from '@hashbrownai/core';
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { HashbrownContext } from '../hashbrown-provider';
import { useHashbrownSignal } from './use-hashbrown-signal';

/**
 * Options for the `useStructuredChat` hook.
 *
 * @public
 * @typeParam Schema - The schema to use for the chat.
 * @typeParam Tools - The set of tool definitions available to the chat.
 * @typeParam Output - The type of the output from the chat.
 * @typeParam State - The shared agent state owned by the runtime.
 */
export interface UseStructuredChatOptions<
  Schema extends s.SchemaOutput,
  Tools extends Chat.AnyTool,
  Output extends s.InferSchemaOutput<Schema> = s.InferSchemaOutput<Schema>,
  State = unknown,
> {
  /**
   * The system message to use for the chat.
   */
  system: string;

  /**
   * The schema to use for the chat.
   */
  schema: Schema;

  /**
   * The initial messages for the chat.
   * default: 1.0
   */
  messages?: Chat.Message<Output, Tools>[];

  /**
   * The initial shared agent state.
   */
  state?: State;
  /**
   * The tools to make available use for the chat.
   * default: []
   */
  tools?: Tools[];

  /**
   * The debounce time between sends to the endpoint.
   * default: 150
   */
  debounceTime?: number;

  /**
   * Number of retries if an error is received.
   * default: 0
   */
  retries?: number;

  /**
   * The name of the hook, useful for debugging.
   */
  debugName?: string;

  /**
   * Optional transport override for this hook.
   */
  transport?: TransportOrFactory;

  /**
   * Whether this structured chat is expected to produce UI elements.
   */
  ui?: boolean;

  /**
   * Optional opaque AG-UI thread identity.
   */
  threadId?: string | undefined;
}

/**
 * The result object-type returned by the `useStructuredChat` hook that provides functions and state for interacting with the chat.
 *
 * @public
 * @typeParam Output - The type of the output from the chat.
 * @typeParam Tools - The set of tool definitions available to the chat.
 * @typeParam State - The shared agent state owned by the runtime.
 */
export interface UseStructuredChatResult<
  Output,
  Tools extends Chat.AnyTool,
  State = unknown,
> {
  /**
   * The currently visible shared agent state.
   */
  readonly state: State | undefined;

  /**
   * Replaces the shared agent state without starting a generation.
   * @param state - The next shared agent state.
   */
  setState(state: State): void;

  /**
   * An array of chat messages.
   */
  messages: Chat.Message<Output, Tools>[];

  /**
   * Function to update the chat messages.
   * @param messages - The new array of chat messages.
   */
  setMessages: (messages: Chat.Message<Output, Tools>[]) => void;

  /**
   * Function to send a new chat message.
   * @param message - The chat message to send.
   */
  sendMessage: (message: Chat.Message<Output, Tools>) => void;

  /**
   * Function to cause current messages to be resent.  Can be used after an error in chat.
   */
  resendMessages: () => void;

  /**
   * Function to stop the chat.
   */
  stop: (clearStreamingMessage?: boolean) => void;

  /**
   * Reload the chat, useful for retrying when an error occurs.
   */
  reload: () => void;

  /**
   * The error encountered during chat operations, if any.
   */
  error: Error | undefined;

  /**
   * Whether the chat is receiving a response.
   */
  isReceiving: boolean;

  /**
   * Whether the chat is sending a response.
   */
  isSending: boolean;

  /**
   * Whether the chat is currently generating.
   */
  isGenerating: boolean;

  /**
   * Whether the chat is running tool calls.
   */
  isRunningToolCalls: boolean;

  /**
   * Aggregate loading flag across transport, generation, and tool calls.
   */
  isLoading: boolean;

  /**
   * Whether the current request has exhausted retries.
   */
  exhaustedRetries: boolean;

  /**
   * Transport/request failure before generation events arrive.
   */
  sendingError: Error | undefined;

  /**
   * Error emitted during generation events.
   */
  generatingError: Error | undefined;

  /**
   * The last assistant message.
   */
  lastAssistantMessage: Chat.AssistantMessage<Output, Tools> | undefined;
}

/**
 * This React hook creates a chat instance used to interact with the LLM.
 * The result object contains functions and state enabling you to send and receive messages and monitor the state of the chat.
 *
 * @public
 * @remarks
 * The `useStructuredChat` hook provides functionality for structured chats. Structured chats are used when you want to use the LLM to generate structured data according to a defined schema. This is particularly useful for:
 * - Generating typed data structures
 * - Creating form responses
 * - Building UI components
 * - Extracting information into a specific format
 *
 * @returns An object containing chat state and functions to interact with the chat.
 *
 * @example
 * In this example, the LLM will respond with a JSON object containing the translations of the input message into English, Spanish, and French.
 * ```tsx
 * const { messages, sendMessage } = useStructuredChat({
 *   system: 'You are a helpful translator that provides accurate translations.',
 *   schema: s.object('Translations', {
 *     english: s.string('English translation'),
 *     spanish: s.string('Spanish translation'),
 *     french: s.string('French translation')
 *   }),
 * });
 * ```
 */
export function useStructuredChat<
  Schema extends s.SchemaOutput,
  Tools extends Chat.AnyTool,
  Output extends s.InferSchemaOutput<Schema> = s.InferSchemaOutput<Schema>,
  State = unknown,
>(
  options: UseStructuredChatOptions<Schema, Tools, Output, State>,
): UseStructuredChatResult<Output, Tools, State> {
  const config = useContext(HashbrownContext);

  if (!config) {
    throw new Error('HashbrownContext not found');
  }

  const hasThreadId = Object.hasOwn(options, 'threadId');
  const tools: Tools[] = useMemo(
    () => options.tools ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    options.tools ?? [],
  );

  const [schema] = useState<Schema>(options.schema);
  const runtimeRef = useRef<ChatRuntime<Output, Tools, State> | null>(null);

  if (!runtimeRef.current) {
    runtimeRef.current = createChatRuntime<Schema, Tools, Output, State>({
      system: options.system,
      responseSchema: schema,
      messages: [...(options.messages ?? [])],
      state: options.state,
      tools,
      debugName: options.debugName,
      debounce: options.debounceTime,
      retries: options.retries,
      transport: options.transport ?? config.transport,
      ui: options.ui ?? false,
      threadId: options.threadId,
    });
  }

  function getRuntime() {
    const instance = runtimeRef.current;

    if (!instance) {
      throw new Error('Chat runtime not found');
    }

    return instance;
  }

  useEffect(() => {
    return getRuntime().start();
  }, []);

  useEffect(() => {
    getRuntime().updateOptions({
      system: options.system,
      responseSchema: schema,
      tools,
      debugName: options.debugName,
      debounce: options.debounceTime,
      retries: options.retries,
      transport: options.transport ?? config.transport,
      ui: options.ui ?? false,
      ...(hasThreadId ? { threadId: options.threadId } : {}),
    });
  }, [
    config.transport,
    options.system,
    options.debugName,
    schema,
    tools,
    options.debounceTime,
    options.retries,
    options.transport,
    options.ui,
    hasThreadId,
    options.threadId,
  ]);

  const internalMessages = useHashbrownSignal(runtimeRef.current.messages);
  const state = useHashbrownSignal(runtimeRef.current.state);
  const isReceiving = useHashbrownSignal(runtimeRef.current.isReceiving);
  const isSending = useHashbrownSignal(runtimeRef.current.isSending);
  const isGenerating = useHashbrownSignal(runtimeRef.current.isGenerating);
  const isRunningToolCalls = useHashbrownSignal(
    runtimeRef.current.isRunningToolCalls,
  );
  const isLoading = useHashbrownSignal(runtimeRef.current.isLoading);
  const exhaustedRetries = useHashbrownSignal(
    runtimeRef.current.exhaustedRetries,
  );
  const error = useHashbrownSignal(runtimeRef.current.error);
  const sendingError = useHashbrownSignal(runtimeRef.current.sendingError);
  const generatingError = useHashbrownSignal(
    runtimeRef.current.generatingError,
  );
  const lastAssistantMessage = useHashbrownSignal(
    runtimeRef.current.lastAssistantMessage,
  );
  const sendMessage = useCallback((message: Chat.Message<Output, Tools>) => {
    getRuntime().sendMessage(message);
  }, []);

  const stop = useCallback((clearStreamingMessage = false) => {
    getRuntime().stop(clearStreamingMessage);
  }, []);

  const resendMessages = useCallback(() => {
    getRuntime().resendMessages();
  }, []);

  const setMessages = useCallback((messages: Chat.Message<Output, Tools>[]) => {
    getRuntime().setMessages(messages);
  }, []);

  const setState = useCallback((state: State) => {
    getRuntime().setState(state);
  }, []);

  const reload = useCallback(() => {
    const lastMessage = internalMessages[internalMessages.length - 1];

    if (lastMessage.role === 'assistant') {
      getRuntime().setMessages(internalMessages.slice(0, -1));

      return true;
    }

    return false;
  }, [internalMessages]);

  return {
    state,
    setState,
    messages: internalMessages,
    stop,
    sendMessage,
    resendMessages,
    setMessages,
    reload,
    error,
    isGenerating,
    isReceiving,
    isSending,
    isRunningToolCalls,
    isLoading,
    exhaustedRetries,
    sendingError,
    generatingError,
    lastAssistantMessage,
  };
}
