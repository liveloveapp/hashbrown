import { ChangeDetectionStrategy, Component } from '@angular/core';
import { s } from '@hashbrownai/core';
import {
  exposeComponent,
  RenderMessageComponent,
  uiChatResource,
} from '@hashbrownai/angular';
import { WelcomeCard } from './welcome-card';

const components = [
  exposeComponent(WelcomeCard, {
    name: 'WelcomeCard',
    description: 'Welcome a developer with a title and a short message.',
    input: {
      title: s.string('A short welcome title'),
      message: s.string('A one-sentence welcome message'),
    },
    children: false,
  }),
];

/** Generates a welcome card from the components we expose. */
@Component({
  selector: 'app-root',
  imports: [RenderMessageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <h1>Your first generated UI</h1>
      <button type="button" [disabled]="chat.isLoading()" (click)="generate()">
        Generate a welcome card
      </button>
      @if (chat.isLoading()) {
        <p role="status">Creating your card...</p>
      }
      @if (chat.error()) {
        <p role="alert">
          We could not create the card. Check your server, then try again.
        </p>
      } @else {
        @for (message of chat.value(); track $index) {
          @if (message.role === 'assistant') {
            <hb-render-message [message]="message" />
          }
        }
      }
    </main>
  `,
})
export class App {
  protected readonly chat = uiChatResource({
    system: 'Welcome developers to Hashbrown. Render one WelcomeCard.',
    components,
  });

  protected generate(): void {
    this.chat.sendMessage({
      role: 'user',
      content:
        'Welcome a developer to Hashbrown. Render a WelcomeCard with a short title and a one-sentence message.',
    });
  }
}
