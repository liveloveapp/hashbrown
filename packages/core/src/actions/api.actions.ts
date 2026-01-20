import { createActionGroup, emptyProps, props } from '../utils/micro-ngrx';
import { Chat } from '../models';
import { s } from '../schema';

export default createActionGroup('api', {
  generateMessageStart: props<{
    responseSchema?: s.HashbrownType;
    emulateStructuredOutput: boolean;
    toolsByName: Record<string, Chat.Internal.Tool>;
  }>(),
  generateMessageChunk: props<Chat.Api.CompletionChunk>(),
  generateMessageFinish: emptyProps(),
  generateMessageSuccess: props<{
    message: Chat.Internal.AssistantMessage;
    toolCalls: Chat.Internal.ToolCall[];
  }>(),
  generateMessageError: props<Error>(),
  generateMessageExhaustedRetries: props<void>(),
  threadLoadStart: emptyProps(),
  threadLoadSuccess: props<{
    thread?: Chat.Api.Message[];
    responseSchema?: s.HashbrownType;
    toolsByName?: Record<string, Chat.Internal.Tool>;
  }>(),
  threadLoadFailure: props<{ error: string; stacktrace?: string }>(),
  threadSaveStart: emptyProps(),
  threadSaveSuccess: props<{ threadId: string }>(),
  threadSaveFailure: props<{ error: string; stacktrace?: string }>(),
  assistantTurnFinalized: emptyProps(),
});
