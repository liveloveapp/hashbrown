import { Component, input } from '@angular/core';
import { s } from '@hashbrownai/core';
import { ComponentPropSchema } from '@hashbrownai/angular';
import { AiToastNotification } from './AiToastNotification';

@Component({
  selector: 'app-ai-refusal',
  imports: [AiToastNotification],
  template: `
    <app-ai-toast-notification
      [title]="title()"
      [message]="message()"
      type="refusal"
    ></app-ai-toast-notification>
  `,
})
export class AiRefusal {
  title = input.required<string>();
  message = input.required<string>();

  static readonly schema: ComponentPropSchema<typeof AiRefusal> = {
    title: s.streaming.string('The title of the refusal message'),
    message: s.streaming.string('The message of the refusal message'),
  };
}
