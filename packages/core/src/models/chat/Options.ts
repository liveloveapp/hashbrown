import { CompletionToolChoiceOption } from './CompletionToolChoiceOption';
import { Message } from './Message';
import { ResponseFormat } from './ResponseFormat';
import { Tool } from './Tool';

export interface Options {
  apiKey: string;
  model: string;
  messages: Message[];
  temperature?: number;
  tools?: Tool[];
  tool_choice?: CompletionToolChoiceOption;
  max_tokens?: number;
  response_format?: ResponseFormat;
}
