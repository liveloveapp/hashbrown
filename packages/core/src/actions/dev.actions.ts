import { Chat } from '../models';
import { s } from '../schema';
import { TransportOrFactory } from '../transport';
import { JsonValue } from '../utils';
import { createActionGroup, props } from '../utils/micro-ngrx';
import type { Message, SystemMessage } from '@ag-ui/core';

export default createActionGroup('dev', {
  init: props<{
    system: string;
    /** Runtime-lowered AG-UI history. @internal */
    canonicalMessages: readonly Readonly<Message>[];
    /** Lossless local projection paired with canonical IDs. @internal */
    localProjection?: {
      readonly messages: readonly Chat.Internal.Message[];
      readonly toolCalls: readonly Chat.Internal.ToolCall[];
    };
    /** Stable configured-system overlay. @internal */
    systemMessage?: Readonly<SystemMessage>;
    debounce?: number;
    messages?: Chat.AnyMessage[];
    tools?: Chat.AnyTool[];
    responseSchema?: s.SchemaOutput;
    retries?: number;
    transport?: TransportOrFactory;
    ui?: boolean;
    threadId?: string | undefined;
    state?: JsonValue;
  }>(),
  setState: props<{
    state: JsonValue | undefined;
  }>(),
  setMessages: props<{
    messages: Chat.AnyMessage[];
    /** Runtime-lowered AG-UI replacement history. @internal */
    canonicalMessages: readonly Readonly<Message>[];
    /** Lossless local projection paired with canonical IDs. @internal */
    localProjection?: {
      readonly messages: readonly Chat.Internal.Message[];
      readonly toolCalls: readonly Chat.Internal.ToolCall[];
    };
    responseSchema?: s.SchemaOutput;
    toolsByName?: Record<string, Chat.Internal.Tool>;
  }>(),
  sendMessage: props<{
    message: Chat.AnyMessage;
    /** Runtime-lowered AG-UI message history addition. @internal */
    canonicalMessages: readonly Readonly<Message>[];
    /** Lossless local projection paired with canonical IDs. @internal */
    localProjection?: {
      readonly messages: readonly Chat.Internal.Message[];
      readonly toolCalls: readonly Chat.Internal.ToolCall[];
    };
    /** Runtime preflight result used to keep projection caches atomic. @internal */
    canonicalAppendCompatible?: boolean;
  }>(),
  resendMessages: props<void>,
  updateOptions: props<{
    debugName?: string;
    system?: string;
    /** Stable configured-system overlay supplied only for a system update. @internal */
    systemMessage?: Readonly<SystemMessage>;
    tools?: Chat.AnyTool[];
    responseSchema?: s.SchemaOutput;
    debounce?: number;
    retries?: number;
    transport?: TransportOrFactory;
    threadId?: string | undefined;
    ui?: boolean;
  }>(),
  stopMessageGeneration: props<boolean>(),
});
