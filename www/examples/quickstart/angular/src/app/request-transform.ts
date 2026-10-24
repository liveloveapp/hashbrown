import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
} from '@angular/core';
import { chatResource } from '@hashbrownai/angular';

/** Runs a fresh support request through the server-owned provider request transformation. */
@Component({
  selector: 'app-request-transform',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <h1>Add workspace context on the server</h1>
      <label for="support-question">Support question</label>
      <textarea
        id="support-question"
        [value]="prompt()"
        (input)="onInput($event)"
      ></textarea>
      <nav aria-label="Support actions">
        <button
          type="button"
          [disabled]="busy() || !prompt().trim()"
          (click)="run()"
        >
          Ask the assistant
        </button>
        <button type="button" [disabled]="!busy()" (click)="cancel()">
          Cancel
        </button>
      </nav>
      <p role="status">{{ status() }}</p>
      @if (chat.error() && !stopped() && !busy()) {
        <p role="alert">
          Check your server, then select Ask the assistant to try again.
        </p>
      }
      <h2>Support reply</h2>
      <section aria-label="Support reply" [attr.aria-busy]="busy()">
        <p>{{ reply() }}</p>
      </section>
    </main>
  `,
})
export class RequestTransform {
  protected readonly prompt = signal('How quickly will our team get support?');
  private readonly started = signal(false);
  protected readonly stopped = signal(false);
  protected readonly chat = chatResource({
    system: '',
    apiUrl: '/api/transformed-chat',
    debugName: 'request-transform',
  });
  protected readonly busy = computed(
    () =>
      this.chat.isSending() ||
      this.chat.isReceiving() ||
      this.chat.isGenerating() ||
      this.chat.isLoading(),
  );
  protected readonly reply = computed(() => {
    // Resource values throw on error, so check before reading the messages.
    if (this.chat.error() || this.stopped()) return '';
    const message = [...this.chat.value()]
      .reverse()
      .find((message) => message.role === 'assistant');
    return typeof message?.content === 'string' ? message.content : '';
  });
  protected readonly status = computed(() => {
    if (this.stopped()) return 'Stopped. Ask the assistant to start again.';
    if (this.busy()) return 'Sending support question…';
    if (this.chat.error())
      return 'Request failed. Ask the assistant to try again.';
    if (!this.started()) return 'Ready';
    if (
      this.chat.lastRunFinishReason() &&
      this.chat.lastRunFinishReason() !== 'stop'
    )
      return 'Reply ended early. Ask the assistant to try again.';
    return 'Support reply complete.';
  });

  protected onInput(event: Event): void {
    this.prompt.set((event.currentTarget as HTMLTextAreaElement).value);
  }

  protected run(): void {
    if (this.busy() || !this.prompt().trim()) return;
    this.started.set(true);
    this.stopped.set(false);
    this.chat.setMessages([
      { id: crypto.randomUUID(), role: 'user', content: this.prompt().trim() },
    ]);
  }

  protected cancel(): void {
    if (!this.busy()) return;
    this.stopped.set(true);
    this.chat.stop();
  }
}
