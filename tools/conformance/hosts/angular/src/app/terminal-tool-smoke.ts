import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
} from '@angular/core';
import { chatResource } from '@hashbrownai/angular';
import { rememberThread, selectedThread } from '../recovery';

function errorText(error: unknown): string {
  return error instanceof Error
    ? error.message
    : error === undefined
      ? ''
      : String(error);
}

/** Generic chat fixture displaying terminal server tools alongside resource errors. */
@Component({
  selector: 'runtime-smoke-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main data-testid="fixture-ready">
      <input
        data-testid="prompt"
        [value]="prompt()"
        (input)="onPromptInput($event)"
      />
      <button data-testid="send" type="button" (click)="send()">Send</button>
      <button data-testid="stop" type="button" (click)="chat.stop()">
        Stop
      </button>
      <button
        data-testid="new-thread"
        type="button"
        (click)="threadId.set(newThreadId())"
      >
        New thread
      </button>
      <div data-testid="recovery-thread">{{ threadId() }}</div>
      <div data-testid="status">
        {{ chat.isLoading() ? 'loading' : 'idle' }}
      </div>
      <div data-testid="user-message">{{ submitted() }}</div>
      <div data-testid="assistant">
        {{ chat.lastAssistantMessage()?.content ?? '' }}
      </div>
      <div data-testid="error">{{ toErrorText(chat.error()) }}</div>
      <div data-testid="sending-error">
        {{ toErrorText(chat.sendingError()) }}
      </div>
      <div data-testid="generating-error">
        {{ toErrorText(chat.generatingError()) }}
      </div>
      <div data-testid="command-error">{{ commandError() }}</div>
      <pre data-testid="server-tool-calls">{{ serverToolCalls() }}</pre>
      <div data-testid="tool-count">0</div>
      <div data-testid="tool-observations">[]</div>
    </main>
  `,
})
export class TerminalToolSmoke {
  protected readonly prompt = signal('');
  protected readonly submitted = signal('');
  protected readonly commandError = signal('');
  protected readonly threadId = signal(selectedThread());
  protected readonly newThreadId = () => crypto.randomUUID();
  protected readonly toErrorText = errorText;
  protected readonly chat = chatResource({
    system: 'Runtime smoke system prompt.',
    threadId: this.threadId,
  });
  // Angular Resource.value() throws in its error state. This public companion
  // signal exposes the retained assistant and terminal tool results safely while
  // chat.error() continues to expose the original generation error.
  protected readonly serverToolCalls = computed(() =>
    JSON.stringify(this.chat.lastAssistantMessage()?.serverToolCalls ?? []),
  );

  protected onPromptInput(event: Event): void {
    this.prompt.set((event.currentTarget as HTMLInputElement).value);
  }

  protected send(): void {
    rememberThread(this.threadId());
    const content = this.prompt();
    this.submitted.set(content);
    this.commandError.set('');
    try {
      this.chat.sendMessage({ role: 'user', content });
    } catch (cause) {
      this.commandError.set(errorText(cause));
    }
  }
}
