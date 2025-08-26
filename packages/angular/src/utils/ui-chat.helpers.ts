/* eslint-disable @typescript-eslint/no-explicit-any */
import { Type } from '@angular/core';
import { Chat, s } from '@hashbrownai/core';

export const TAG_NAME_REGISTRY = Symbol('ɵtagNameRegistry');

export type TagNameRegistry = {
  [tagName: string]: {
    props: Record<string, s.HashbrownType>;
    component: Type<object>;
  };
};

export type RenderableMessage = {
  [TAG_NAME_REGISTRY]: TagNameRegistry;
};

export const getTagNameRegistry = (
  message: Chat.Message<UiChatSchema, Chat.AnyTool>,
): TagNameRegistry | undefined => {
  if (TAG_NAME_REGISTRY in message) {
    return message[TAG_NAME_REGISTRY] as TagNameRegistry;
  }

  return undefined;
};

export interface UiChatSchemaComponent {
  $tag: string;
  $children: string | UiChatSchemaComponent[];
  $props: Record<string, any>;
}

export interface UiChatSchema {
  ui: UiChatSchemaComponent[];
}

export type UiAssistantMessage<Tools extends Chat.AnyTool = Chat.AnyTool> =
  Chat.AssistantMessage<UiChatSchema, Tools> & {
    [TAG_NAME_REGISTRY]: TagNameRegistry;
  };

export type UiUserMessage = Chat.UserMessage;
export type UiErrorMessage = Chat.ErrorMessage;

export type UiChatMessage<Tools extends Chat.AnyTool = Chat.AnyTool> =
  | UiAssistantMessage<Tools>
  | UiUserMessage
  | UiErrorMessage;
