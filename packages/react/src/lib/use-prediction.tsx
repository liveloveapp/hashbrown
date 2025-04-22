import { Chat, s } from '@hashbrownai/core';
import {
  StructuredChatInterface,
  StructuredChatOptions,
  useStructuredChat,
} from './use-structured-chat';

export interface PredictionOptions<OutputSchema extends Chat.ResponseFormat>
  extends StructuredChatOptions<OutputSchema> {
  input: string;
  details: string;
}

export interface PredictionInterface<OutputSchema extends Chat.ResponseFormat>
  extends StructuredChatInterface<OutputSchema> {
  predictions: s.Infer<OutputSchema>;
}

export const usePrediction = <OutputSchema extends Chat.ResponseFormat>(
  options: PredictionOptions<OutputSchema>,
): PredictionInterface<OutputSchema> => {
  const chat = useStructuredChat(options);

  return {
    ...chat,
  };
};
