/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Core entry point for the Hashbrown framework.
 * Provides state management and messaging utilities for integrating LLM-based chat interactions into frontend applications.
 */
import { devActions, internalActions } from './actions';
import effects from './effects';
import { Chat } from './models';
import {
  reducers,
  selectExhaustedRetries,
  selectGeneratingError,
  selectIsGenerating,
  selectIsLoading,
  selectIsReceiving,
  selectIsRunningToolCalls,
  selectIsSending,
  selectLastAssistantMessage,
  selectResponseSchema,
  selectSendingError,
  selectThreadId,
  selectToolEntities,
  selectUnifiedError,
  selectViewMessages,
} from './reducers';
import { s } from './schema';
import { createStore, StateSignal } from './utils/micro-ngrx';
import { createHttpTransport, TransportOrFactory } from './transport';
import {
  createSystemMessage,
  lowerViewMessagesToAgUi,
} from './reducers/ag-ui-message-history';

/**
 * A stateful client runtime for sending messages, processing AG-UI events,
 * executing tools, and exposing reactive chat state.
 *
 * @public
 * @typeParam Output - The type of messages received from the LLM, either a string or structured output defined by HashbrownType.
 * @typeParam Tools - The set of tools available to the chat instance.
 */
export interface ChatRuntime<Output, Tools extends Chat.AnyTool> {
  messages: StateSignal<Chat.Message<Output, Tools>[]>;
  error: StateSignal<Error | undefined>;
  isReceiving: StateSignal<boolean>;
  isSending: StateSignal<boolean>;
  isGenerating: StateSignal<boolean>;
  isRunningToolCalls: StateSignal<boolean>;
  isLoading: StateSignal<boolean>;
  exhaustedRetries: StateSignal<boolean>;
  sendingError: StateSignal<Error | undefined>;
  generatingError: StateSignal<Error | undefined>;
  lastAssistantMessage: StateSignal<
    Chat.AssistantMessage<Output, Tools> | undefined
  >;
  /** The opaque AG-UI thread identity used by the current and subsequent runs. */
  threadId: StateSignal<string | undefined>;

  /** Replace the current set of messages in the chat state. */
  setMessages: (messages: Chat.Message<Output, Tools>[]) => void;

  /** Send a new message to the LLM and update state. */
  sendMessage: (message: Chat.Message<Output, Tools>) => void;
  /** Resend messages and update state. Often used manually after an error.*/
  resendMessages: () => void;

  /** Update the chat options after initialization */
  updateOptions: (
    options: Partial<{
      debugName?: string;
      system: string;
      tools: Tools[];
      responseSchema: s.SchemaOutput;
      debounce: number;
      retries: number;
      transport: TransportOrFactory;
      ui?: boolean;
      /** Set to undefined to clear the current AG-UI thread identity. */
      threadId?: string | undefined;
    }>,
  ) => void;

  /** Stop the current LLM interaction. */
  stop: (clearStreamingMessage?: boolean) => void;

  /** Start the runtime effect loop and return a function that disposes it. */
  start: () => () => void;
}

/**
 * Create a stateful client chat runtime with the given configuration.
 *
 * @public
 * @typeParam Output - The type of messages expected from the LLM.
 * @typeParam Tools - The set of tools to register with the chat instance.
 * @param init - Initialization options containing:
 *   - `debugName`: Optional debug name for devtools tracing
 *   - `system`: System prompt or initial context for the chat
 *   - `messages`: Initial message history
 *   - `tools`: Array of tools to enable in the instance
 *   - `responseSchema`: JSON schema for validating structured output
 *   - `debounce`: Debounce interval in milliseconds for sending messages
 * @returns A configured chat runtime. Call `start()` to activate its effects.
 */
export function createChatRuntime<Tools extends Chat.AnyTool>(init: {
  debugName?: string;
  system: string;
  messages?: Chat.Message<string, Tools>[];
  tools?: Tools[];
  debounce?: number;
  retries?: number;
  transport?: TransportOrFactory;
  ui?: boolean;
  threadId?: string;
}): ChatRuntime<string, Tools>;
/**
 * @public
 */
export function createChatRuntime<
  Schema extends s.SchemaOutput,
  Tools extends Chat.AnyTool,
  Output extends s.InferSchemaOutput<Schema> = s.InferSchemaOutput<Schema>,
>(init: {
  debugName?: string;
  system: string;
  messages?: Chat.Message<Output, Tools>[];
  tools?: Tools[];
  responseSchema: Schema;
  debounce?: number;
  retries?: number;
  transport?: TransportOrFactory;
  ui?: boolean;
  threadId?: string;
}): ChatRuntime<Output, Tools>;
/**
 * @public
 */
export function createChatRuntime(init: {
  debugName?: string;
  system: string;
  messages?: Chat.Message<string, Chat.AnyTool>[];
  tools?: Chat.AnyTool[];
  responseSchema?: s.SchemaOutput;
  debounce?: number;
  retries?: number;
  transport?: TransportOrFactory;
  ui?: boolean;
  threadId?: string;
}): ChatRuntime<any, Chat.AnyTool> {
  const initialThreadId = init.threadId;
  const transport = init.transport ?? (() => createHttpTransport({}));
  const createCanonicalId = () =>
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `hashbrown-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const systemMessageId = createCanonicalId();
  const lower = (messages: readonly Chat.AnyMessage[]) =>
    lowerViewMessagesToAgUi(messages, { createId: createCanonicalId });

  const state = createStore({
    debugName: init.debugName,
    reducers,
    effects,
    projectStateForDevtools: (state) => ({
      messages: selectViewMessages(state),
      isReceiving: selectIsReceiving(state),
      isSending: selectIsSending(state),
      isGenerating: selectIsGenerating(state),
      isRunningToolCalls: selectIsRunningToolCalls(state),
      isLoading: selectIsLoading(state),
      threadId: selectThreadId(state),
      sendingError: selectSendingError(state),
      generatingError: selectGeneratingError(state),
      error: selectUnifiedError(state),
      ɵɵinternal: state,
    }),
  });

  state.dispatch(
    devActions.init({
      system: init.system,
      messages: init.messages as Chat.AnyMessage[],
      canonicalMessages: lower(init.messages ?? []),
      systemMessage: createSystemMessage(systemMessageId, init.system),
      tools: init.tools as Chat.AnyTool[],
      responseSchema: init.responseSchema,
      debounce: init.debounce,
      retries: init.retries,
      transport,
      ui: init.ui,
      threadId: initialThreadId,
    }),
  );

  function setMessages(messages: Chat.Message<any, Chat.AnyTool>[]) {
    const responseSchema = state.read(selectResponseSchema);
    const toolsByName = state.read(selectToolEntities);
    state.dispatch(
      devActions.setMessages({
        messages: messages as Chat.AnyMessage[],
        canonicalMessages: lower(messages as Chat.AnyMessage[]),
        responseSchema,
        toolsByName,
      }),
    );
  }

  function sendMessage(message: Chat.Message<any, Chat.AnyTool>) {
    state.dispatch(
      devActions.sendMessage({
        message: message as Chat.AnyMessage,
        canonicalMessages: lower([message as Chat.AnyMessage]),
      }),
    );
  }

  function resendMessages() {
    state.dispatch(devActions.resendMessages());
  }

  function updateOptions(
    options: Partial<{
      debugName?: string;
      system: string;
      tools: Chat.AnyTool[];
      responseSchema: s.SchemaOutput;
      debounce: number;
      retries: number;
      transport: TransportOrFactory;
      ui?: boolean;
      threadId?: string | undefined;
    }>,
  ) {
    state.dispatch(
      devActions.updateOptions({
        ...options,
        ...(Object.hasOwn(options, 'system')
          ? {
              systemMessage: createSystemMessage(
                systemMessageId,
                options.system ?? '',
              ),
            }
          : {}),
      }),
    );
  }

  function start() {
    const abortController = new AbortController();
    let effectCleanupFn: () => void;

    Promise.resolve().then(() => {
      if (abortController.signal.aborted) {
        return;
      }

      effectCleanupFn = state.runEffects();

      state.dispatch(internalActions.start());
    });

    return () => {
      abortController.abort('Initialization aborted');
      effectCleanupFn?.();
    };
  }

  function stop(clearStreamingMessage = false) {
    const isLoading = state.read(selectIsLoading);

    if (!isLoading) {
      throw new Error('Cannot stop streaming messages when not streaming.');
    }

    state.dispatch(devActions.stopMessageGeneration(clearStreamingMessage));
  }

  return {
    setMessages,
    sendMessage,
    resendMessages,
    updateOptions,
    stop,
    start,
    messages: state.createSignal(selectViewMessages),
    error: state.createSignal(selectUnifiedError),
    isReceiving: state.createSignal(selectIsReceiving),
    isSending: state.createSignal(selectIsSending),
    isGenerating: state.createSignal(selectIsGenerating),
    isRunningToolCalls: state.createSignal(selectIsRunningToolCalls),
    isLoading: state.createSignal(selectIsLoading),
    sendingError: state.createSignal(selectSendingError),
    generatingError: state.createSignal(selectGeneratingError),
    exhaustedRetries: state.createSignal(selectExhaustedRetries),
    lastAssistantMessage: state.createSignal(selectLastAssistantMessage),
    threadId: state.createSignal(selectThreadId),
  };
}
