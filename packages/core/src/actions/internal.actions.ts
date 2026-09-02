import { createActionGroup, emptyProps, props } from '../utils/micro-ngrx';
import { Chat } from '../models';

export default createActionGroup('internal', {
  start: emptyProps(),
  generationAttemptStarted: emptyProps(),
  generationAttemptRolledBack: emptyProps(),
  logicalGenerationSettled: emptyProps(),
  generationSilentlyRetired: emptyProps(),
  toolTurnSettled: props<{
    toolCalls: Chat.Internal.ToolCall[];
    toolMessages: Chat.Api.ToolMessage[];
    continuation: 'continue' | 'stop';
  }>(),
  runToolCallsError: props<Error>(),
  skippedToolCalls: emptyProps(),
});
