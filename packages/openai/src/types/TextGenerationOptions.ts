import { ChatMessage } from './ChatMessage';
import { TextGenerationResponseFormat } from './TextGenerationResponseFormat';
import { TextGenerationTool } from './TextGenerationTool';

export interface TextGenerationOptions {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  tools?: TextGenerationTool[];
  tool_choice?:
    | 'auto'
    | 'none'
    | {
        type: 'function';
        function: {
          name: string;
        };
      };
  max_tokens?: number;
  response_format?: TextGenerationResponseFormat;
}
