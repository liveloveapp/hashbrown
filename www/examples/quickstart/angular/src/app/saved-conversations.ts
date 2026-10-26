import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  output,
  signal,
} from '@angular/core';
import { chatResource } from '@hashbrownai/angular';
import {
  deleteTextHistory,
  type LoadedTextHistory,
  loadTextHistory,
  restoreTextMessages,
  saveTextHistory,
} from './text-history';

type ThreadId = 'personal' | 'work';
interface Selection {
  readonly id: ThreadId;
  readonly initial: LoadedTextHistory;
  readonly revision: number;
}

@Component({
  selector: 'app-saved-thread',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label for="conversation">Conversation</label>
    <select
      id="conversation"
      [value]="selection().id"
      [disabled]="chat.isLoading()"
      (change)="select($event)"
    >
      <option value="personal">Personal</option>
      <option value="work">Work</option>
    </select>
    @if (selection().initial.issue) {
      <p role="alert">
        Saved messages could not be restored. Clear this conversation to replace
        them.
      </p>
    }
    <label for="prompt">Your message</label>
    <input id="prompt" [value]="prompt()" (input)="onInput($event)" />
    <button
      type="button"
      [disabled]="
        chat.isLoading() ||
        !prompt().trim() ||
        selection().initial.issue === 'invalid'
      "
      (click)="send()"
    >
      Send message
    </button>
    <button type="button" [disabled]="chat.isLoading()" (click)="clear()">
      Clear this conversation
    </button>
    @if (chat.isLoading()) {
      <p role="status">Waiting for a reply...</p>
    }
    @if (chat.error()) {
      <p role="alert">
        The request failed. The previous saved conversation is unchanged.
      </p>
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
    @if (saveState() === 'saved' && !chat.isLoading()) {
      <p role="status">Saved in this browser</p>
    }
    @if (saveState() === 'failed') {
      <p role="alert">
        We could not save or clear this conversation. Keep this page open to
        retain its current messages.
      </p>
    }
  `,
})
/** One live chat instance, seeded from the selected storage snapshot. */
export class SavedThread {
  private readonly initialSelection = inject(SavedConversations).selection();
  readonly selection = () => this.initialSelection;
  readonly selected = output<ThreadId>();
  readonly reset = output<void>();
  protected readonly prompt = signal(
    'My name is Sam. Say hello in one sentence.',
  );
  protected readonly saveState = signal<'idle' | 'saved' | 'failed'>('idle');
  protected readonly chat = chatResource({
    system:
      'You are a friendly onboarding assistant. Keep each reply to one sentence.',
    threadId: this.selection().id,
    messages: restoreTextMessages(this.selection().initial.messages),
  });

  constructor() {
    effect(() => {
      if (this.chat.isLoading() || this.chat.error()) return;
      const messages = this.chat.value();
      if (messages.length === 0) return;
      if (this.selection().initial.issue) {
        this.saveState.set('failed');
        return;
      }
      this.saveState.set(
        saveTextHistory(this.selection().id, messages) ? 'saved' : 'failed',
      );
    });
  }

  protected select(event: Event): void {
    const id = (event.currentTarget as HTMLSelectElement).value;
    if (id === 'personal' || id === 'work') this.selected.emit(id);
  }
  protected onInput(event: Event): void {
    this.prompt.set((event.currentTarget as HTMLInputElement).value);
  }
  protected send(): void {
    if (this.chat.isLoading() || !this.prompt().trim()) return;
    this.chat.sendMessage({ role: 'user', content: this.prompt() });
    this.prompt.set('');
  }
  protected clear(): void {
    if (deleteTextHistory(this.selection().id)) this.reset.emit();
    else this.saveState.set('failed');
  }
}

/** Switches between two browser-stored, completed text conversations. */
@Component({
  selector: 'app-saved-conversations',
  imports: [SavedThread],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <h1>A conversation that survives refresh</h1>
      @for (active of [selection()]; track active.id + ':' + active.revision) {
        <app-saved-thread (selected)="select($event)" (reset)="reset()" />
      }
    </main>
  `,
})
export class SavedConversations {
  readonly selection = signal<Selection>({
    id: 'personal',
    initial: loadTextHistory('personal'),
    revision: 0,
  });
  protected select(id: ThreadId): void {
    this.selection.set({ id, initial: loadTextHistory(id), revision: 0 });
  }
  protected reset(): void {
    const active = this.selection();
    this.selection.set({
      ...active,
      initial: loadTextHistory(active.id),
      revision: active.revision + 1,
    });
  }
}
