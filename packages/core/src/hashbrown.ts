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
  selectError,
  selectExhaustedRetries,
  selectIsLoading,
  selectIsReceiving,
  selectIsRunningToolCalls,
  selectIsSending,
  selectLastAssistantMessage,
  selectViewMessages,
} from './reducers';
import { s } from './schema';
import { createStore, StateSignal } from './utils/micro-ngrx';
import { KnownModelIds } from './utils';

/**
 * Represents a Hashbrown chat instance, providing methods to send and observe messages, track state, and handle errors.
 *
 * @public
 * @typeParam Output - The type of messages received from the LLM, either a string or structured output defined by HashbrownType.
 * @typeParam Tools - The set of tools available to the chat instance.
 */
export interface Hashbrown<Output, Tools extends Chat.AnyTool> {
  messages: StateSignal<Chat.Message<Output, Tools>[]>;
  error: StateSignal<Error | undefined>;
  isReceiving: StateSignal<boolean>;
  isSending: StateSignal<boolean>;
  isRunningToolCalls: StateSignal<boolean>;
  isLoading: StateSignal<boolean>;
  exhaustedRetries: StateSignal<boolean>;
  lastAssistantMessage: StateSignal<
    Chat.AssistantMessage<Output, Tools> | undefined
  >;

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
      apiUrl: string;
      model: KnownModelIds;
      system: string;
      tools: Tools[];
      responseSchema: s.HashbrownType;
      middleware: Chat.Middleware[];
      emulateStructuredOutput: boolean;
      debounce: number;
      retries: number;
    }>,
  ) => void;

  /** Stop the current LLM interaction. */
  stop: (clearStreamingMessage?: boolean) => void;

  /** Start the Hashbrown effect loop. */
  sizzle: () => () => void;
}

/**
 * Initialize a Hashbrown chat instance with the given configuration.
 *
 * @public
 * @typeParam Output - The type of messages expected from the LLM.
 * @typeParam Tools - The set of tools to register with the chat instance.
 * @param init - Initialization options containing:
 *   - `debugName`: Optional debug name for devtools tracing
 *   - `apiUrl`: Base URL of the Hashbrown API endpoint
 *   - `model`: The LLM model identifier to use
 *   - `system`: System prompt or initial context for the chat
 *   - `messages`: Initial message history
 *   - `tools`: Array of tools to enable in the instance
 *   - `responseSchema`: JSON schema for validating structured output
 *   - `middleware`: Middleware functions to run on messages
 *   - `emulateStructuredOutput`: Whether to emulate structured output behavior
 *   - `debounce`: Debounce interval in milliseconds for sending messages
 * @returns A configured Hashbrown instance.
 * @throws If a reserved tool name ("output") is used.
 */
export function fryHashbrown<Tools extends Chat.AnyTool>(init: {
  debugName?: string;
  apiUrl: string;
  model: KnownModelIds;
  system: string;
  messages?: Chat.Message<string, Tools>[];
  tools?: Tools[];
  middleware?: Chat.Middleware[];
  emulateStructuredOutput?: boolean;
  debounce?: number;
  retries?: number;
}): Hashbrown<string, Tools>;
/**
 * @public
 */
export function fryHashbrown<
  Schema extends s.HashbrownType,
  Tools extends Chat.AnyTool,
  Output extends s.Infer<Schema> = s.Infer<Schema>,
>(init: {
  debugName?: string;
  apiUrl: string;
  model: KnownModelIds;
  system: string;
  messages?: Chat.Message<Output, Tools>[];
  tools?: Tools[];
  responseSchema: Schema;
  middleware?: Chat.Middleware[];
  emulateStructuredOutput?: boolean;
  debounce?: number;
  retries?: number;
}): Hashbrown<Output, Tools>;
/**
 * @public
 */
export function fryHashbrown(init: {
  debugName?: string;
  apiUrl: string;
  model: KnownModelIds;
  system: string;
  messages?: Chat.Message<string, Chat.AnyTool>[];
  tools?: Chat.AnyTool[];
  responseSchema?: s.HashbrownType;
  middleware?: Chat.Middleware[];
  emulateStructuredOutput?: boolean;
  debounce?: number;
  retries?: number;
}): Hashbrown<any, Chat.AnyTool> {
  const hasIllegalOutputTool = init.tools?.some(
    (tool) => tool.name === 'output',
  );

  if (hasIllegalOutputTool) {
    throw new Error(
      'The "output" tool name is a reserved tool name and cannot be used.',
    );
  }

  const state = createStore({
    debugName: init.debugName,
    reducers,
    effects,
    projectStateForDevtools: (state) => ({
      messages: selectViewMessages(state),
      isReceiving: selectIsReceiving(state),
      isSending: selectIsSending(state),
      isRunningToolCalls: selectIsRunningToolCalls(state),
      error: selectError(state),
      ɵɵinternal: state,
    }),
  });

  state.dispatch(
    devActions.init({
      apiUrl: init.apiUrl,
      model: init.model,
      system: init.system,
      messages: init.messages as Chat.AnyMessage[],
      tools: init.tools as Chat.AnyTool[],
      responseSchema: init.responseSchema,
      middleware: init.middleware,
      emulateStructuredOutput: init.emulateStructuredOutput,
      debounce: init.debounce,
      retries: init.retries,
    }),
  );

  function setMessages(messages: Chat.Message<any, Chat.AnyTool>[]) {
    state.dispatch(
      devActions.setMessages({ messages: messages as Chat.AnyMessage[] }),
    );
  }

  function sendMessage(message: Chat.Message<any, Chat.AnyTool>) {
    state.dispatch(
      devActions.sendMessage({ message: message as Chat.AnyMessage }),
    );
  }

  function resendMessages() {
    state.dispatch(devActions.resendMessages());
  }

  function updateOptions(
    options: Partial<{
      debugName?: string;
      apiUrl: string;
      model: KnownModelIds;
      system: string;
      tools: Chat.AnyTool[];
      responseSchema: s.HashbrownType;
      middleware: Chat.Middleware[];
      emulateStructuredOutput: boolean;
      debounce: number;
      retries: number;
    }>,
  ) {
    state.dispatch(devActions.updateOptions(options));
  }

  function sizzle() {
    const abortController = new AbortController();
    let effectCleanupFn: () => void;

    Promise.resolve().then(() => {
      if (abortController.signal.aborted) {
        return;
      }

      effectCleanupFn = state.runEffects();

      state.dispatch(internalActions.sizzle());
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
    sizzle,
    messages: state.createSignal(selectViewMessages),
    error: state.createSignal(selectError),
    isReceiving: state.createSignal(selectIsReceiving),
    isSending: state.createSignal(selectIsSending),
    isRunningToolCalls: state.createSignal(selectIsRunningToolCalls),
    isLoading: state.createSignal(selectIsLoading),
    exhaustedRetries: state.createSignal(selectExhaustedRetries),
    lastAssistantMessage: state.createSignal(selectLastAssistantMessage),
  };
}
