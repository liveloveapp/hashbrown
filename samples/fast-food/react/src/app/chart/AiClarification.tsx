import { s } from '@hashbrownai/core';
import type { ComponentPropSchema } from '@hashbrownai/react';
import { AiToastNotification } from './AiToastNotification';

export interface AiClarificationProps {
  title: string;
  message: string;
}

const AiClarificationComponent = ({
  title,
  message,
}: AiClarificationProps) => (
  <AiToastNotification title={title} message={message} type="info" />
);

const schema: ComponentPropSchema<typeof AiClarificationComponent> = {
  title: s.streaming.string('The title of the clarification message'),
  message: s.streaming.string('The message of the clarification message'),
};

export const AiClarification = Object.assign(AiClarificationComponent, {
  schema,
});
