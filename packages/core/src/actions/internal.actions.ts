import { createActionGroup, emptyProps, props } from '../utils/micro-ngrx';
import { Chat } from '../models';

export default createActionGroup('internal', {
  start: emptyProps(),
  logicalGenerationStarted: props<{ generationId: string }>(),
  generationAttemptClaimed: props<{
    generationId: string;
    attemptId: string;
  }>(),
  generationAttemptReleased: props<{
    generationId: string;
    attemptId: string;
  }>(),
  generationAttemptStarted: emptyProps(),
  generationAttemptRolledBack: emptyProps(),
  logicalGenerationSettled: props<{ generationId: string }>(),
  generationSilentlyRetired: emptyProps(),
  toolTurnSettled: props<{
    toolCalls: Chat.Internal.ToolCall[];
    toolMessages: Chat.Api.ToolMessage[];
    continuation: 'continue' | 'stop';
  }>(),
  runToolCallsError: props<Error>(),
  skippedToolCalls: emptyProps(),
});
