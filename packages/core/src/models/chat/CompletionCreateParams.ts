import { CompletionToolChoiceOption } from './CompletionToolChoiceOption';
import { Message } from './Message';
import { ResponseFormat } from './ResponseFormat';
import { Tool } from './Tool';

export type CompletionCreateParams = {
  model: string;
  messages: Message[];
  tools?: Tool[];
  tool_choice?: CompletionToolChoiceOption;
  temperature?: number;
  max_tokens?: number;
  response_format?: ResponseFormat;
};
