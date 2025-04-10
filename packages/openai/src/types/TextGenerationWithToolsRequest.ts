import { ChatMessage } from './ChatMessage';
import { TextGenerationResponseFormat } from './TextGenerationResponseFormat';
import { TextGenerationTool } from './TextGenerationTool';

export type TextGenerationWithToolsRequest = {
  model: string;
  messages: ChatMessage[];
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
  temperature?: number;
  max_tokens?: number;
  response_format?: TextGenerationResponseFormat;
};
