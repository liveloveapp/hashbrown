import { s } from '@hashbrownai/core';
import React from 'react';
import { useChat } from './ChatProvider';
import { BoundTool } from './create-tool.fn';

export type ChatComponent = {
  name: string;
  description: string;
  component: React.ComponentType<any>;
  inputs: Record<string, s.AnyType>;
};

export const exposeComponent = (
  name: string,
  description: string,
  component: React.ComponentType<any>,
  inputs: Record<string, s.AnyType>,
): ChatComponent => {
  return {
    name,
    description,
    component,
    inputs,
  };
};

export interface RichChatConfig {
  predictionPrompt: string;
  components: ChatComponent[];
  tools?: BoundTool<string, any>[];
}

export const useRichChat = (config: RichChatConfig) => {
  const { predictionPrompt, components, tools } = config;

  const { messages, sendMessage, isThinking, stop } = useChat();

  components.map((component) => console.log(component));

  return {
    messages,
    sendMessage,
    isThinking,
    stop,
  };
};
