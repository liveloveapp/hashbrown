import { Chat } from '../models';
import { s } from '../schema';
import { createActionGroup, props } from '../utils/micro-ngrx';

export default createActionGroup('dev', {
  init: props<{
    apiUrl: string;
    model: string;
    prompt: string;
    debounce?: number;
    temperature?: number;
    maxTokens?: number;
    messages?: Chat.AnyMessage[];
    tools?: Chat.AnyTool[];
    responseSchema?: s.HashbrownType;
    middleware?: Chat.Middleware[];
    emulateStructuredOutput?: boolean;
  }>(),
  setMessages: props<{
    messages: Chat.AnyMessage[];
  }>(),
  sendMessage: props<{
    message: Chat.AnyMessage;
  }>(),
  updateOptions: props<{
    debugName?: string;
    apiUrl?: string;
    model?: string;
    prompt?: string;
    temperature?: number;
    maxTokens?: number;
    tools?: Chat.AnyTool[];
    responseSchema?: s.HashbrownType;
    middleware?: Chat.Middleware[];
    emulateStructuredOutput?: boolean;
    debounce?: number;
  }>(),
});
