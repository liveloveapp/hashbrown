import { BoundTool } from './create-tool.fn';
import { s } from './schema';
import { Chat } from './types';

export interface ChatProviderProps {
  model: string;
  temperature?: number;
  tools?: BoundTool<string, any>[];
  maxTokens?: number;
  messages?: Chat.Message[];
  responseFormat?: s.AnyType;
}

export const ChatProvider = (props: ChatProviderProps) => {
  const { model, temperature, tools, maxTokens, messages, responseFormat } =
    props;

  return <div>PredictionProvider</div>;
};
