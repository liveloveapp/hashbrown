import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
} from '@angular/core';
import { chatResource } from '@hashbrownai/angular';

/** Runs a fresh support request through the server-owned decision workflow. */
@Component({
  selector: 'app-agent-decisions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <h1>Route a support request</h1>
      <label for="customer-message">Customer message</label>
      <textarea
        id="customer-message"
        [value]="prompt()"
        (input)="onInput($event)"
      ></textarea>
      <nav aria-label="Agent actions">
        <button
          type="button"
          [disabled]="busy() || !prompt().trim()"
          (click)="run()"
        >
          Run agent
        </button>
        <button type="button" [disabled]="!busy()" (click)="cancel()">
          Cancel
        </button>
      </nav>
      <p role="status">{{ status() }}</p>
      @if (chat.error() && !stopped() && !busy()) {
        <p role="alert">
          Check your server, then select Run agent to try again.
        </p>
      }
      <h2>Agent reply</h2>
      <section aria-label="Agent reply" [attr.aria-busy]="busy()">
        <p>{{ reply() }}</p>
      </section>
    </main>
  `,
})
export class AgentDecisions {
  protected readonly prompt = signal('Where is order HB-1042?');
  private readonly started = signal(false);
  protected readonly stopped = signal(false);
  protected readonly chat = chatResource({
    system: '',
    apiUrl: '/api/agent',
    debugName: 'agent-decisions',
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
    if (this.stopped()) return 'Stopped. Run agent to start again.';
    if (this.busy()) return 'Running agent…';
    if (this.chat.error()) return 'Request failed. Run agent to try again.';
    if (!this.started()) return 'Ready';
    if (
      this.chat.lastRunFinishReason() &&
      this.chat.lastRunFinishReason() !== 'stop'
    )
      return 'Reply ended early. Run agent to try again.';
    return 'Agent reply complete.';
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
