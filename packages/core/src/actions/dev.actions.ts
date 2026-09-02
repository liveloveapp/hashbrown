import { Chat } from '../models';
import { s } from '../schema';
import { TransportOrFactory } from '../transport';
import { JsonValue } from '../utils';
import { createActionGroup, props } from '../utils/micro-ngrx';

export default createActionGroup('dev', {
  init: props<{
    system: string;
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
    responseSchema?: s.SchemaOutput;
    toolsByName?: Record<string, Chat.Internal.Tool>;
  }>(),
  sendMessage: props<{
    message: Chat.AnyMessage;
  }>(),
  resendMessages: props<void>,
  updateOptions: props<{
    debugName?: string;
    system?: string;
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
