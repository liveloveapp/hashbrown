import { s } from '@hashbrownai/core';
import type { ComponentPropSchema } from '@hashbrownai/react';
import { AiToastNotification } from './AiToastNotification';

export interface AiSuccessProps {
  title: string;
  message: string;
}

const AiSuccessComponent = ({ title, message }: AiSuccessProps) => (
  <AiToastNotification title={title} message={message} type="success" />
);

const schema: ComponentPropSchema<typeof AiSuccessComponent> = {
  title: s.streaming.string('The title of the success message'),
  message: s.streaming.string('The message of the success message'),
};

export const AiSuccess = Object.assign(AiSuccessComponent, { schema });
