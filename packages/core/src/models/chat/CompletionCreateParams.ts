import { HashbrownType } from '../../schema/internal';
import { CompletionToolChoiceOption } from './CompletionToolChoiceOption';
import { Message } from './Message';
import { Tool } from './Tool';

export type CompletionCreateParams = {
  max_tokens?: number;
  messages: Message[];
  model: string;
  response_format?: HashbrownType | object;
  temperature?: number;
  tool_choice?: CompletionToolChoiceOption;
  tools?: Tool[];
};
