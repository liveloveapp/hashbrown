import { createActionGroup, emptyProps, props } from '../utils/micro-ngrx';
import { Chat } from '../models';

export default createActionGroup('api', {
  generateMessageStart: emptyProps(),
  generateMessageChunk: props<Chat.Api.AssistantMessage>(),
  generateMessageSuccess: props<Chat.Api.AssistantMessage>(),
  generateMessageError: props<Error>(),
  generateMessageExhaustedRetries: props<void>(),
});
