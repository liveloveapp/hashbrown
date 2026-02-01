import { Chat } from '../models';
import { s } from '../schema';
import { type ModelInput, TransportOrFactory } from '../transport';
import { createActionGroup, props } from '../utils/micro-ngrx';

export default createActionGroup('dev', {
  init: props<{
    apiUrl?: string;
    model: ModelInput;
    system: string;
    debounce?: number;
    messages?: Chat.AnyMessage[];
    tools?: Chat.AnyTool[];
    responseSchema?: s.SchemaOutput;
    middleware?: Chat.Middleware[];
    emulateStructuredOutput?: boolean;
    retries?: number;
    transport?: TransportOrFactory;
    ui?: boolean;
    threadId?: string;
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
    apiUrl?: string;
    model?: ModelInput;
    system?: string;
    tools?: Chat.AnyTool[];
    responseSchema?: s.SchemaOutput;
    middleware?: Chat.Middleware[];
    emulateStructuredOutput?: boolean;
    debounce?: number;
    retries?: number;
    transport?: TransportOrFactory;
    threadId?: string;
    ui?: boolean;
  }>(),
  stopMessageGeneration: props<boolean>(),
});
