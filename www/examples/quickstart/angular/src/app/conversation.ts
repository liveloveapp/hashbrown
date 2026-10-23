import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { chatResource } from '@hashbrownai/angular';

/** A text conversation that keeps earlier turns in the current chat instance. */
@Component({
  selector: 'app-conversation',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <h1>A conversation with context</h1>
      <label for="prompt">Your message</label>
      <input id="prompt" [value]="prompt()" (input)="onInput($event)" />
      <button
        type="button"
        [disabled]="chat.isLoading() || !prompt().trim()"
        (click)="send()"
      >
        Send message
      </button>
      @if (chat.isLoading()) {
        <p role="status">Waiting for a reply...</p>
      }
      @if (chat.error()) {
        <p role="alert">The request failed. Check your server and try again.</p>
      } @else {
        <ol aria-label="Conversation">
          @for (message of chat.value(); track $index) {
            <li>
              <strong>{{ message.role }}: </strong>
              @if (
                message.role === 'user' ||
                message.role === 'assistant' ||
                message.role === 'error'
              ) {
                {{ message.content }}
              } @else {
                Activity received
              }
            </li>
          }
        </ol>
      }
    </main>
  `,
})
export class Conversation {
  protected readonly prompt = signal(
    'My name is Sam. Say hello in one sentence.',
  );
  protected readonly chat = chatResource({
    system:
      'You are a friendly onboarding assistant. Keep each reply to one sentence.',
    debugName: 'onboarding',
  });

  protected onInput(event: Event): void {
    this.prompt.set((event.currentTarget as HTMLInputElement).value);
  }

  protected send(): void {
    if (!this.prompt().trim() || this.chat.isLoading()) return;
    this.chat.sendMessage({ role: 'user', content: this.prompt() });
    this.prompt.set('');
  }
}
