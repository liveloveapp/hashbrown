import { CompletionToolChoiceOption } from './CompletionToolChoiceOption';
import { Message } from './Message';
import { ResponseFormat } from './ResponseFormat';
import { Tool } from './Tool';

export type CompletionCreateParams = {
  max_tokens?: number;
  messages: Message[];
  model: string;
  response_format?: object;
  temperature?: number;
  tool_choice?: CompletionToolChoiceOption;
  tools?: Tool[];
};
