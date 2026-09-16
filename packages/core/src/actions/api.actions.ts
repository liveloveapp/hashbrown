import type { AGUIEvent } from '@ag-ui/core';
import { createActionGroup, props } from '../utils/micro-ngrx';
import { Chat } from '../models';
import { s } from '../schema';

/** Payloads retain the named AG-UI event type in generated declarations. */
type ApiActionPayloads = {
  generateMessageStart: {
    responseSchema?: s.SchemaOutput;
    toolsByName: Record<string, Chat.Internal.Tool>;
  };
  generateMessageEvent: AGUIEvent;
  generateMessageSuccess: {
    message?: Chat.Internal.AssistantMessage;
    toolCalls: Chat.Internal.ToolCall[];
  };
  generateMessageError: Error;
  generateMessageExhaustedRetries: void;
};

const actionProps: {
  [K in keyof ApiActionPayloads]: (
    payload: ApiActionPayloads[K],
  ) => ApiActionPayloads[K];
} = {
  generateMessageStart: props<ApiActionPayloads['generateMessageStart']>(),
  generateMessageEvent: props<AGUIEvent>(),
  generateMessageSuccess: props<ApiActionPayloads['generateMessageSuccess']>(),
  generateMessageError: props<Error>(),
  generateMessageExhaustedRetries: props<void>(),
};

const apiActions: ReturnType<
  typeof createActionGroup<'api', typeof actionProps>
> = createActionGroup('api', actionProps);

export default apiActions;
