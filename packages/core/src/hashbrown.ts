/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Core entry point for the Hashbrown framework.
 * Provides state management and messaging utilities for integrating LLM-based chat interactions into frontend applications.
 */
import { devActions } from './actions';
import effects from './effects';
import { Chat } from './models';
import {
  reducers,
  selectError,
  selectIsLoading,
  selectIsReceiving,
  selectIsRunningToolCalls,
  selectIsSending,
  selectViewMessages,
} from './reducers';
import { s } from './schema';
import { createStore } from './utils/micro-ngrx';

/**
 * Represents a Hashbrown chat instance, providing methods to send and observe messages, track state, and handle errors.
 *
 * @template Output - The type of messages received from the LLM, either a string or structured output defined by HashbrownType.
 * @template Tools - The set of tools available to the chat instance.
 */
export interface Hashbrown<Output, Tools extends Chat.AnyTool> {
  /** Replace the current set of messages in the chat state. */
  setMessages: (messages: Chat.Message<Output, Tools>[]) => void;

  /** Send a new message to the LLM and update state. */
  sendMessage: (message: Chat.Message<Output, Tools>) => void;

  /** Subscribe to message updates; invokes callback on state changes. */
  observeMessages: (
    onChange: (messages: Chat.Message<Output, Tools>[]) => void,
  ) => void;

  /** Subscribe to receiving state; true when awaiting LLM response. */
  observeIsReceiving: (onChange: (isReceiving: boolean) => void) => void;

  /** Subscribe to sending state; true when a message is queued for sending. */
  observeIsSending: (onChange: (isSending: boolean) => void) => void;

  /** Subscribe to tool call execution state. */
  observeIsRunningToolCalls: (
    onChange: (isRunningToolCalls: boolean) => void,
  ) => void;

  /** Subscribe to loading state; true when the chat is loading. */
  observeIsLoading: (onChange: (isLoading: boolean) => void) => void;

  /** Subscribe to error state; invokes callback if an error occurs. */
  observeError: (onChange: (error: Error | null) => void) => void;

  /** The current messages in the chat. */
  readonly messages: Chat.Message<Output, Tools>[];

  /** The current error state of the chat. */
  readonly error: Error | null;

  /** Update the chat options after initialization */
  updateOptions: (
    options: Partial<{
      debugName?: string;
      apiUrl: string;
      model: string;
      system: string;
      tools: Tools[];
      responseSchema: s.HashbrownType;
      middleware: Chat.Middleware[];
      emulateStructuredOutput: boolean;
      debounce: number;
    }>,
  ) => void;

  /** Clean up resources and listeners associated with this Hashbrown instance. */
  teardown: () => void;
}

/**
 * Initialize a Hashbrown chat instance with the given configuration.
 *
 * @template Output - The type of messages expected from the LLM.
 * @template Tools - The set of tools to register with the chat instance.
 * @param {Object} init - Initialization options.
 * @param {string} [init.debugName] - Optional debug name for devtools tracing.
 * @param {string} init.apiUrl - Base URL of the Hashbrown API endpoint.
 * @param {string} init.model - The LLM model identifier to use.
 * @param {string} init.system - System prompt or initial context for the chat.
 * @param {Chat.Message<Output, Tools>[]} [init.messages] - Initial message history.
 * @param {Tools[]} [init.tools] - Array of tools to enable in the instance.
 * @param {s.HashbrownType} [init.responseSchema] - JSON schema for validating structured output.
 * @param {Chat.Middleware[]} [init.middleware] - Middleware functions to run on messages.
 * @param {boolean} [init.emulateStructuredOutput] - Whether to emulate structured output behavior.
 * @param {number} [init.debounce] - Debounce interval in milliseconds for sending messages.
 * @returns {Hashbrown<Output, Tools>} A configured Hashbrown instance.
 * @throws {Error} If a reserved tool name ("output") is used.
 */
export function fryHashbrown<Tools extends Chat.AnyTool>(init: {
  debugName?: string;
  apiUrl: string;
  model: string;
  system: string;
  messages?: Chat.Message<string, Tools>[];
  tools?: Tools[];
  middleware?: Chat.Middleware[];
  emulateStructuredOutput?: boolean;
  debounce?: number;
}): Hashbrown<string, Tools>;
export function fryHashbrown<
  Schema extends s.HashbrownType,
  Tools extends Chat.AnyTool,
  Output extends s.Infer<Schema> = s.Infer<Schema>,
>(init: {
  debugName?: string;
  apiUrl: string;
  model: string;
  system: string;
  messages?: Chat.Message<Output, Tools>[];
  tools?: Tools[];
  responseSchema: Schema;
  middleware?: Chat.Middleware[];
  emulateStructuredOutput?: boolean;
  debounce?: number;
}): Hashbrown<Output, Tools>;
export function fryHashbrown(init: {
  debugName?: string;
  apiUrl: string;
  model: string;
  system: string;
  messages?: Chat.Message<string, Chat.AnyTool>[];
  tools?: Chat.AnyTool[];
  responseSchema?: s.HashbrownType;
  middleware?: Chat.Middleware[];
  emulateStructuredOutput?: boolean;
  debounce?: number;
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
      θθinternal: state,
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

  function observeMessages(
    onChange: (messages: Chat.Message<any, Chat.AnyTool>[]) => void,
  ) {
    return state.select(selectViewMessages, (messages) =>
      onChange(messages as Chat.Message<any, Chat.AnyTool>[]),
    );
  }

  function observeIsReceiving(onChange: (isReceiving: boolean) => void) {
    return state.select(selectIsReceiving, onChange);
  }

  function observeIsSending(onChange: (isSending: boolean) => void) {
    return state.select(selectIsSending, onChange);
  }

  function observeIsRunningToolCalls(
    onChange: (isRunningToolCalls: boolean) => void,
  ) {
    return state.select(selectIsRunningToolCalls, onChange);
  }

  function observeIsLoading(onChange: (isLoading: boolean) => void) {
    return state.select(selectIsLoading, onChange);
  }

  function observeError(onChange: (error: Error | null) => void) {
    return state.select(selectError, onChange);
  }

  function updateOptions(
    options: Partial<{
      debugName?: string;
      apiUrl: string;
      model: string;
      system: string;
      tools: Chat.AnyTool[];
      responseSchema: s.HashbrownType;
      middleware: Chat.Middleware[];
      emulateStructuredOutput: boolean;
      debounce: number;
    }>,
  ) {
    state.dispatch(devActions.updateOptions(options));
  }

  function teardown() {
    state.teardown();
  }

  return {
    setMessages,
    sendMessage,
    observeMessages,
    observeIsReceiving,
    observeIsSending,
    observeIsRunningToolCalls,
    observeIsLoading,
    observeError,
    updateOptions,
    teardown,
    get messages() {
      return state.read(selectViewMessages);
    },
    get error() {
      return state.read(selectError);
    },
  };
}
