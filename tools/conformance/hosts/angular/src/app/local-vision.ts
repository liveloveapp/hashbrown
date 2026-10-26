import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
} from '@angular/core';
import { structuredChatResource } from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';
import { createLocalMediaContent } from '../local-transport';

const schema = s.object('Image answer', {
  answer: s.string('Foreground square color in lowercase'),
  count: s.number('Number of foreground squares'),
});

/** Explicit WebLLM image fixture with fresh threads and parsed schema output. */
@Component({
  selector: 'runtime-local-vision',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section>
    <button data-testid="new-thread" type="button" (click)="newThread()">
      New thread
    </button>
    <button data-testid="send" type="button" (click)="send()">
      Send generated image
    </button>
    <button data-testid="stop" type="button" (click)="stop()">Stop</button>
    <div data-testid="structured-answer">
      {{ chat.lastAssistantMessage()?.content?.answer ?? '' }}
    </div>
    <div data-testid="structured-count">
      {{ chat.lastAssistantMessage()?.content?.count ?? '' }}
    </div>
    <div data-testid="status">{{ chat.isLoading() ? 'loading' : 'idle' }}</div>
    <div data-testid="error">{{ errorText() }}</div>
  </section>`,
})
export class LocalVision {
  protected readonly thread = signal(0);
  protected readonly threadId = computed(
    () => `vision-thread-${this.thread()}`,
  );
  protected readonly commandError = signal('');
  protected readonly chat = structuredChatResource({
    threadId: this.threadId,
    system:
      'Answer from the latest image only. Return the requested JSON object.',
    schema,
  });
  protected newThread(): void {
    this.commandError.set('');
    this.chat.setMessages([]);
    this.thread.update((value) => value + 1);
  }
  protected send(): void {
    this.commandError.set('');
    try {
      this.chat.sendMessage({
        role: 'user',
        content: createLocalMediaContent(),
      });
    } catch (error) {
      this.commandError.set(String(error));
    }
  }
  /** Repeated or late Stop events must not call the runtime after generation ends. */
  protected stop(): void {
    if (this.chat.isLoading()) this.chat.stop();
  }
  protected errorText(): string {
    const error =
      this.chat.error() ??
      this.chat.sendingError() ??
      this.chat.generatingError();
    return this.commandError() || (error === undefined ? '' : String(error));
  }
}
