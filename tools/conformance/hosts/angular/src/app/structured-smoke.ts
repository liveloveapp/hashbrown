import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
} from '@angular/core';
import { structuredChatResource } from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';
import { InterruptControls } from './interrupt-controls';
import { createRecoveryControls } from './recovery-controls';
import { rememberThread, selectedThread } from '../recovery';

const answerSchema = s.object('Runtime smoke answer', {
  answer: s.streaming.string('Answer text'),
  count: s.number('Result count'),
});

function readRetries(): number {
  const value = Number.parseInt(
    new URL(globalThis.location.href).searchParams.get('retries') ?? '0',
    10,
  );

  return Math.min(1, Math.max(0, Number.isNaN(value) ? 0 : value));
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return error === undefined ? '' : String(error);
}

/** Angular structured chat fixture used by the shared runtime smoke scenario. */
@Component({
  selector: 'runtime-structured-smoke',
  standalone: true,
  imports: [InterruptControls],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section>
      <input
        data-testid="prompt"
        [value]="prompt()"
        (input)="onPromptInput($event)"
      />
      <button
        data-testid="send"
        type="button"
        [disabled]="recovery.disabled()"
        (click)="send()"
      >
        Send
      </button>
      <button data-testid="stop" type="button" (click)="stop()">Stop</button>
      <runtime-interrupt-controls
        [disabled]="recovery.disabled()"
        [batch]="chat.pendingInterrupts()"
        [isResuming]="chat.isResuming()"
        [resume]="chat.resume"
      />
      @if (recovery.enabled) {
        <button
          data-testid="refresh-recovery"
          [disabled]="recovery.fetching() || chat.isLoading()"
          (click)="recovery.refresh()"
        >
          Refresh recovery
        </button>
      }
      <button data-testid="new-thread" (click)="recovery.newThread()">
        New thread
      </button>
      <div data-testid="recovery-status">{{ recovery.status() }}</div>
      <div data-testid="recovery-fetching">{{ recovery.fetching() }}</div>
      <div data-testid="recovery-required">{{ chat.recovery().required }}</div>
      <div data-testid="recovery-thread">{{ threadId() }}</div>
      @for (
        diagnostic of chat.recovery().diagnostics ?? [];
        track diagnostic.messageId
      ) {
        <pre
          data-testid="recovery-diagnostic"
          [attr.data-message-id]="diagnostic.messageId"
          [attr.data-thread-id]="diagnostic.threadId"
          [attr.data-kind]="diagnostic.kind"
          [textContent]="diagnostic.content"
        ></pre>
      }
      <div
        data-testid="status"
        [textContent]="chat.isLoading() ? 'loading' : 'idle'"
      ></div>
      <div data-testid="user-message" [textContent]="submitted()"></div>
      <div data-testid="assistant"></div>
      <div data-testid="error" [textContent]="toErrorText(chat.error())"></div>
      <div
        data-testid="sending-error"
        [textContent]="toErrorText(chat.sendingError())"
      ></div>
      <div
        data-testid="generating-error"
        [textContent]="toErrorText(chat.generatingError())"
      ></div>
      <div data-testid="tool-count">0</div>
      <div data-testid="structured-answer" [textContent]="answer()"></div>
      <div data-testid="structured-count" [textContent]="count()"></div>
    </section>
  `,
})
export class StructuredSmoke {
  protected readonly prompt = signal('');
  protected readonly threadId = signal(selectedThread());
  protected readonly submitted = signal('');
  protected readonly toErrorText = errorText;
  protected readonly chat = structuredChatResource({
    system: 'Runtime smoke system prompt.',
    threadId: this.threadId,
    schema: answerSchema,
    retries: readRetries(),
  });
  protected readonly recovery = createRecoveryControls(
    this.chat,
    this.threadId,
    (value) => this.threadId.set(value),
  );
  protected readonly answer = computed(
    () => this.chat.lastAssistantMessage()?.content?.answer ?? '',
  );
  protected readonly count = computed(
    () => this.chat.lastAssistantMessage()?.content?.count ?? '',
  );

  protected onPromptInput(event: Event): void {
    this.prompt.set((event.currentTarget as HTMLInputElement).value);
  }

  protected send(): void {
    rememberThread(this.threadId());
    const content = this.prompt();
    this.submitted.set(content);
    this.chat.sendMessage({ role: 'user', content });
  }

  protected stop(): void {
    this.chat.stop();
  }
}
