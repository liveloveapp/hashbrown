import { Component, input } from '@angular/core';
import { s } from '@hashbrownai/core';
import { ComponentPropSchema } from '@hashbrownai/angular';
import { AiToastNotification } from './AiToastNotification';

@Component({
  selector: 'app-ai-clarification',
  imports: [AiToastNotification],
  template: `
    <app-ai-toast-notification
      [title]="title()"
      [message]="message()"
      type="info"
    ></app-ai-toast-notification>
  `,
})
export class AiClarification {
  title = input.required<string>();
  message = input.required<string>();

  static readonly schema: ComponentPropSchema<typeof AiClarification> = {
    title: s.streaming.string('The title of the clarification message'),
    message: s.streaming.string('The message of the clarification message'),
  };
}
