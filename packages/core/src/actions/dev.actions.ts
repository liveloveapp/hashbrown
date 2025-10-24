import { Chat } from '../models';
import { s } from '../schema';
import { KnownModelIds } from '../utils';
import { createActionGroup, props } from '../utils/micro-ngrx';

export default createActionGroup('dev', {
  init: props<{
    apiUrl: string;
    model: KnownModelIds;
    system: string;
    debounce?: number;
    messages?: Chat.AnyMessage[];
    tools?: Chat.AnyTool[];
    responseSchema?: s.HashbrownType;
    middleware?: Chat.Middleware[];
    emulateStructuredOutput?: boolean;
    retries?: number;
    lenses?: Chat.AnyLens[];
  }>(),
  setMessages: props<{
    messages: Chat.AnyMessage[];
  }>(),
  sendMessage: props<{
    message: Chat.AnyMessage;
  }>(),
  resendMessages: props<void>,
  updateOptions: props<{
    debugName?: string;
    apiUrl?: string;
    model?: KnownModelIds;
    system?: string;
    tools?: Chat.AnyTool[];
    responseSchema?: s.HashbrownType;
    middleware?: Chat.Middleware[];
    emulateStructuredOutput?: boolean;
    debounce?: number;
    retries?: number;
  }>(),
  stopMessageGeneration: props<boolean>(),
});
