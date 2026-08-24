import type { AGUIEvent } from '@ag-ui/core';
import { createActionGroup, props } from '../utils/micro-ngrx';
import { Chat } from '../models';
import { s } from '../schema';

export default createActionGroup('api', {
  generateMessageStart: props<{
    responseSchema?: s.SchemaOutput;
    emulateStructuredOutput: boolean;
    toolsByName: Record<string, Chat.Internal.Tool>;
  }>(),
  generateMessageEvent: props<AGUIEvent>(),
  generateMessageSuccess: props<{
    message: Chat.Internal.AssistantMessage;
    toolCalls: Chat.Internal.ToolCall[];
  }>(),
  generateMessageError: props<Error>(),
  generateMessageExhaustedRetries: props<void>(),
  assistantTurnFinalized: props<{
    toolCalls: Chat.Internal.ToolCall[];
    continuation: 'continue' | 'stop';
  }>(),
});
