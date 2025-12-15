import { Component, input } from '@angular/core';
import { s } from '@hashbrownai/core';
import { ComponentPropSchema } from '@hashbrownai/angular';
import { AiToastNotification } from './AiToastNotification';

@Component({
  selector: 'app-ai-success',
  imports: [AiToastNotification],
  template: `
    <app-ai-toast-notification
      [title]="title()"
      [message]="message()"
      type="success"
    ></app-ai-toast-notification>
  `,
})
export class AiSuccess {
  title = input.required<string>();
  message = input.required<string>();

  static readonly schema: ComponentPropSchema<typeof AiSuccess> = {
    title: s.streaming.string('The title of the success message'),
    message: s.streaming.string('The message of the success message'),
  };
}
