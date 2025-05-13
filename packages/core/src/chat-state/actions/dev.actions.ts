import { createActionGroup, props } from '../../utils/micro-ngrx';
import { Chat } from '../models';
import { s } from '../../schema';

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
  }>(),
  setMessages: props<{
    messages: Chat.AnyMessage[];
  }>(),
  sendMessage: props<{
    message: Chat.AnyMessage;
  }>(),
});
