import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { chatResource } from '@hashbrownai/angular';
import { createLocalMediaContent } from '../local-transport';

/** Opt-in generated media fixture rendered through the Angular chat resource. */
@Component({
  selector: 'runtime-local-media',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section>
      <button data-testid="send" type="button" (click)="send()">
        Send generated media
      </button>
      <button data-testid="stop" type="button" (click)="chat.stop()">
        Stop
      </button>
      <div data-testid="assistant">
        {{ chat.lastAssistantMessage()?.content ?? '' }}
      </div>
      <div data-testid="status">
        {{ chat.isLoading() ? 'loading' : 'idle' }}
      </div>
      <div data-testid="error">{{ errorText() }}</div>
    </section>
  `,
})
export class LocalMedia {
  protected readonly commandError = signal('');
  protected readonly chat = chatResource({
    system: 'Follow the user instruction. Return only the requested answer.',
  });

  protected errorText(): string {
    const error =
      this.chat.error() ??
      this.chat.sendingError() ??
      this.chat.generatingError();
    return this.commandError() || (error === undefined ? '' : String(error));
  }

  protected send(): void {
    this.commandError.set('');
    try {
      this.chat.sendMessage({
        role: 'user',
        content: createLocalMediaContent(),
      });
    } catch (cause) {
      this.commandError.set(String(cause));
    }
  }
}
