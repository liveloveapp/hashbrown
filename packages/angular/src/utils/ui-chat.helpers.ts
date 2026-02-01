import { Type } from '@angular/core';
import {
  Chat,
  type ComponentFallbackProps,
  type ComponentNode,
  s,
} from '@hashbrownai/core';

export const TAG_NAME_REGISTRY = Symbol('ɵtagNameRegistry');

/**
 * @public
 */
export type TagNameRegistry = {
  [tagName: string]: {
    props: Record<string, s.HashbrownType>;
    component: Type<object>;
    fallback?: Type<ComponentFallbackProps>;
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

/**
 * @public
 */
export type UiChatSchemaComponent = ComponentNode;

/**
 * @public
 */
export interface UiChatSchema {
  ui: UiChatSchemaComponent[];
}

/**
 * @public
 */
export type UiAssistantMessage<Tools extends Chat.AnyTool = Chat.AnyTool> =
  Chat.AssistantMessage<UiChatSchema, Tools> & {
    [TAG_NAME_REGISTRY]: TagNameRegistry;
  };

/**
 * @public
 */
export type UiUserMessage = Chat.UserMessage;

/**
 * @public
 */
export type UiErrorMessage = Chat.ErrorMessage;

/**
 * @public
 */
export type UiChatMessage<Tools extends Chat.AnyTool = Chat.AnyTool> =
  | UiAssistantMessage<Tools>
  | UiUserMessage
  | UiErrorMessage;
