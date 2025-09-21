import { s } from '@hashbrownai/core';
import type { ComponentPropSchema } from '@hashbrownai/react';
import { AiToastNotification } from './AiToastNotification';

export interface AiRefusalProps {
  title: string;
  message: string;
}

const AiRefusalComponent = ({ title, message }: AiRefusalProps) => (
  <AiToastNotification title={title} message={message} type="refusal" />
);

const schema: ComponentPropSchema<typeof AiRefusalComponent> = {
  title: s.streaming.string('The title of the refusal message'),
  message: s.streaming.string('The message of the refusal message'),
};

export const AiRefusal = Object.assign(AiRefusalComponent, { schema });
