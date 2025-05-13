import { createStore } from '../utils/micro-ngrx';
import {
  reducers,
  selectError,
  selectIsReceiving,
  selectIsRunningToolCalls,
  selectIsSending,
  selectViewMessages,
} from './reducers';
import effects from './effects';
import { Chat } from './models';
import { s } from '../schema';
import { devActions } from './actions';

export interface Hashbrown<
  Output extends string | s.HashbrownType,
  Tools extends Chat.AnyTool,
> {
  setMessages: (messages: Chat.Message<Output, Tools>[]) => void;
  sendMessage: (message: Chat.Message<Output, Tools>) => void;
  observeMessages: (
    onChange: (messages: Chat.Message<Output, Tools>[]) => void,
  ) => void;
  observeIsReceiving: (onChange: (isReceiving: boolean) => void) => void;
  observeIsSending: (onChange: (isSending: boolean) => void) => void;
  observeIsRunningToolCalls: (
    onChange: (isRunningToolCalls: boolean) => void,
  ) => void;
  observeError: (onChange: (error: Error | null) => void) => void;
  teardown: () => void;
}

export function fryHashbrown<
  Output extends string | s.HashbrownType,
  Tools extends Chat.AnyTool,
>(init: {
  debugName?: string;
  apiUrl: string;
  model: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  messages?: Chat.Message<Output, Tools>[];
  tools?: Tools[];
  responseSchema?: s.HashbrownType;
}): Hashbrown<Output, Tools> {
  const state = createStore({
    debugName: init.debugName,
    reducers,
    effects,
  });

  state.dispatch(
    devActions.init({
      apiUrl: init.apiUrl,
      model: init.model,
      prompt: init.prompt,
      temperature: init.temperature,
      maxTokens: init.maxTokens,
      messages: init.messages as Chat.AnyMessage[],
      tools: init.tools as Chat.AnyTool[],
      responseSchema: init.responseSchema,
    }),
  );

  function setMessages(messages: Chat.Message<Output, Tools>[]) {
    state.dispatch(
      devActions.setMessages({ messages: messages as Chat.AnyMessage[] }),
    );
  }

  function sendMessage(message: Chat.Message<Output, Tools>) {
    state.dispatch(
      devActions.sendMessage({ message: message as Chat.AnyMessage }),
    );
  }

  function observeMessages(
    onChange: (messages: Chat.Message<Output, Tools>[]) => void,
  ) {
    return state.select(selectViewMessages, (messages) =>
      onChange(messages as Chat.Message<Output, Tools>[]),
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

  function observeError(onChange: (error: Error | null) => void) {
    return state.select(selectError, onChange);
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
    observeError,
    teardown,
  };
}
