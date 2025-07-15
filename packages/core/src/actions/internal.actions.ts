import { createActionGroup, emptyProps, props } from '../utils/micro-ngrx';
import { Chat } from '../models';

export default createActionGroup('internal', {
  sizzle: emptyProps(),
  runToolCallsSuccess: props<{
    toolMessages: Chat.Api.ToolMessage[];
  }>(),
  runToolCallsError: props<Error>(),
  skippedToolCalls: emptyProps(),
});
