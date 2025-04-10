import { ChatMessage } from './ChatMessage';

export type TextGenerationWithToolsResponse = {
  id: string;
  object: string;
  created: number;
  choices: {
    message: ChatMessage;
    finish_reason: string;
    index: number;
  }[];
};
