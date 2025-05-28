import { Chat } from '../models';
import { s } from '../schema';
import { createActionGroup, props } from '../utils/micro-ngrx';

export default createActionGroup('dev', {
  init: props<{
    apiUrl: string;
    model: string;
    system: string;
    debounce?: number;
    messages?: Chat.AnyMessage[];
    tools?: Chat.AnyTool[];
    responseSchema?: s.HashbrownType;
    middleware?: Chat.Middleware[];
    emulateStructuredOutput?: boolean;
    retries?: number;
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
    model?: string;
    system?: string;
    tools?: Chat.AnyTool[];
    responseSchema?: s.HashbrownType;
    middleware?: Chat.Middleware[];
    emulateStructuredOutput?: boolean;
    debounce?: number;
    retries?: number;
  }>(),
});
