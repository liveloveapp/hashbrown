import { select } from '../../utils/micro-ngrx';
import { Prettify } from '../../utils/types';
import * as fromConfig from './config.reducer';
import * as fromMessages from './messages.reducer';
import * as fromStatus from './status.reducer';
import * as fromStreamingMessage from './streaming-message.reducer';
import * as fromToolCalls from './tool-calls.reducer';
import * as fromTools from './tools.reducer';
import { Chat } from '../models';

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

/**
 * Streaming Message
 */
export const selectStreamingMessageState = (state: State) =>
  state.streamingMessage;
export const selectStreamingMessage = select(
  selectStreamingMessageState,
  fromStreamingMessage.selectStreamingMessage,
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

/**
 * Config
 */
export const selectConfigState = (state: State) => state.config;
export const selectApiUrl = select(selectConfigState, fromConfig.selectApiUrl);
export const selectModel = select(selectConfigState, fromConfig.selectModel);
export const selectPrompt = select(selectConfigState, fromConfig.selectPrompt);
export const selectDebounce = select(
  selectConfigState,
  fromConfig.selectDebounce,
);
export const selectTemperature = select(
  selectConfigState,
  fromConfig.selectTemperature,
);
export const selectMaxTokens = select(
  selectConfigState,
  fromConfig.selectMaxTokens,
);
export const selectResponseSchema = select(
  selectConfigState,
  fromConfig.selectResponseSchema,
);

/**
 * Top-level selectors
 */
export const selectViewMessages = select(
  selectMessages,
  selectToolCallEntities,
  selectStreamingMessage,
  selectResponseSchema,
  (
    messages,
    toolCalls,
    streamingMessage,
    responseSchema,
  ): Chat.AnyMessage[] => {
    return [
      ...messages,
      ...(streamingMessage ? [streamingMessage] : []),
    ].flatMap((message): Chat.AnyMessage[] => {
      const result = Chat.helpers.toViewMessageFromInternal(
        message,
        toolCalls,
        responseSchema,
      );

      if (!result) {
        return [];
      }

      return [result];
    });
  },
);

export const selectApiMessages = select(
  selectPrompt,
  selectMessages,
  selectToolCalls,
  (prompt, messages, toolCalls): Chat.Api.Message[] => {
    return [
      {
        role: 'system',
        content: prompt,
      },
      ...messages.flatMap((message): Chat.Api.Message[] => {
        return Chat.helpers.toApiMessageFromInternal(message, toolCalls);
      }),
    ];
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
