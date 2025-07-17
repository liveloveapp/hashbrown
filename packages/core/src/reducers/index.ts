/* eslint-disable @typescript-eslint/no-explicit-any */
import { Chat } from '../models';
import { Prettify } from '../utils/types';
import { s } from '../schema';
import { select } from '../utils/micro-ngrx';
import * as fromConfig from './config.reducer';
import * as fromMessages from './messages.reducer';
import * as fromStatus from './status.reducer';
import * as fromStreamingMessage from './streaming-message.reducer';
import * as fromToolCalls from './tool-calls.reducer';
import * as fromTools from './tools.reducer';

export const reducers = {
  config: fromConfig.reducer,
  messages: fromMessages.reducer,
  status: fromStatus.reducer,
  streamingMessage: fromStreamingMessage.reducer,
  toolCalls: fromToolCalls.reducer,
  tools: fromTools.reducer,
};

type State = Prettify<{
  [P in keyof typeof reducers]: ReturnType<(typeof reducers)[P]>;
}>;

/**
 * Messages
 */
export const selectMessagesState = (state: State) => state.messages;
export const selectMessages = select(
  selectMessagesState,
  fromMessages.selectMessages,
);

/**
 * Status
 */
export const selectStatusState = (state: State) => state.status;
export const selectIsReceiving = select(
  selectStatusState,
  fromStatus.selectIsReceiving,
);
export const selectIsSending = select(
  selectStatusState,
  fromStatus.selectIsSending,
);
export const selectIsRunningToolCalls = select(
  selectStatusState,
  fromStatus.selectIsRunningToolCalls,
);
export const selectError = select(selectStatusState, fromStatus.selectError);

export const selectExhaustedRetries = select(
  selectStatusState,
  fromStatus.selectExhaustedRetries,
);

/**
 * Streaming Message
 */
export const selectStreamingMessageState = (state: State) =>
  state.streamingMessage;
export const selectStreamingMessage = select(
  selectStreamingMessageState,
  fromStreamingMessage.selectStreamingMessage,
);
export const selectStreamingToolCallEntities = select(
  selectStreamingMessageState,
  fromStreamingMessage.selectStreamingToolCallEntities,
);

/**
 * Tools
 */
export const selectToolsState = (state: State) => state.tools;
export const selectTools = select(selectToolsState, fromTools.selectTools);
export const selectToolEntities = select(
  selectToolsState,
  fromTools.selectToolEntities,
);

/**
 * Tool Calls
 */
export const selectToolCallsState = (state: State) => state.toolCalls;
export const selectToolCalls = select(
  selectToolCallsState,
  fromToolCalls.selectToolCalls,
);
export const selectToolCallEntities = select(
  selectToolCallsState,
  fromToolCalls.selectToolCallEntities,
);
export const selectPendingToolCalls = select(
  selectToolCallsState,
  fromToolCalls.selectPendingToolCalls,
);

/**
 * Config
 */
export const selectConfigState = (state: State) => state.config;
export const selectApiUrl = select(selectConfigState, fromConfig.selectApiUrl);
export const selectMiddleware = select(
  selectConfigState,
  fromConfig.selectMiddleware,
);
export const selectModel = select(selectConfigState, fromConfig.selectModel);
export const selectSystem = select(selectConfigState, fromConfig.selectSystem);
export const selectDebounce = select(
  selectConfigState,
  fromConfig.selectDebounce,
);
export const selectRetries = select(
  selectConfigState,
  fromConfig.selectRetries,
);
export const selectResponseSchema = select(
  selectConfigState,
  fromConfig.selectResponseSchema,
);
export const selectEmulateStructuredOutput = select(
  selectConfigState,
  fromConfig.selectEmulateStructuredOutput,
);

/**
 * Top-level selectors
 */
const selectNonStreamingViewMessages = select(
  selectMessages,
  selectToolCallEntities,
  selectTools,
  selectResponseSchema,
  (messages, toolCalls, tools, responseSchema) => {
    return messages.flatMap((message): Chat.AnyMessage[] =>
      Chat.helpers.toViewMessagesFromInternal(
        message,
        toolCalls,
        tools,
        responseSchema,
      ),
    );
  },
);

const selectStreamingViewMessages = select(
  selectStreamingMessage,
  selectStreamingToolCallEntities,
  selectTools,
  selectResponseSchema,
  (streamingMessage, streamingToolCalls, tools, responseSchema) => {
    return (streamingMessage ? [streamingMessage] : []).flatMap(
      (message): Chat.AnyMessage[] =>
        Chat.helpers.toViewMessagesFromInternal(
          message,
          streamingToolCalls,
          tools,
          responseSchema,
        ),
    );
  },
);

export const selectViewMessages = select(
  selectNonStreamingViewMessages,
  selectStreamingViewMessages,
  (nonStreamingMessages, streamingMessages) => {
    return [...nonStreamingMessages, ...streamingMessages];
  },
);

export const selectLastAssistantMessage = select(
  selectViewMessages,
  (messages): Chat.AssistantMessage<any, any> | undefined => {
    return messages.findLast((message) => message.role === 'assistant');
  },
);

export const selectApiMessages = select(
  selectMessages,
  selectToolCalls,
  (messages, toolCalls): Chat.Api.Message[] => {
    return messages.flatMap((message): Chat.Api.Message[] =>
      Chat.helpers.toApiMessagesFromInternal(message, toolCalls),
    );
  },
);

export const selectShouldGenerateMessage = select(
  selectApiMessages,
  (messages) => {
    const lastMessage = messages[messages.length - 1];

    if (!lastMessage) {
      return false;
    }

    return lastMessage.role === 'user' || lastMessage.role === 'tool';
  },
);

export const selectApiTools = select(
  selectTools,
  selectResponseSchema,
  selectEmulateStructuredOutput,
  (tools, responseSchema, emulateStructuredOutput) => {
    return Chat.helpers.toApiToolsFromInternal(
      tools,
      emulateStructuredOutput && !!responseSchema,
      responseSchema ?? s.nullish(),
    );
  },
);

export const selectIsLoading = select(
  selectIsSending,
  selectIsReceiving,
  selectIsRunningToolCalls,
  (isSending, isReceiving, isRunningToolCalls) =>
    isSending || isReceiving || isRunningToolCalls,
);
