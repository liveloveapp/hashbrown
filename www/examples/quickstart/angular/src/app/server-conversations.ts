import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  output,
  signal,
} from '@angular/core';
import { chatResource } from '@hashbrownai/angular';
import type { Chat } from '@hashbrownai/core';
import { encodeTextHistory, restoreTextMessages } from './text-history';
import {
  loadServerHistory,
  saveServerHistory,
  type ServerHistory,
} from './server-history';

type ThreadId = 'personal' | 'work';

/** Owns one loaded runtime and saves completed responses one at a time. */
@Component({
  selector: 'app-server-thread',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label for="prompt">Your message</label>
    <input id="prompt" [value]="prompt()" (input)="onInput($event)" />
    <button
      type="button"
      [disabled]="
        chat.isLoading() ||
        saveState() === 'saving' ||
        saveState() === 'failed' ||
        !prompt().trim()
      "
      (click)="send()"
    >
      Send message
    </button>
    <button
      type="button"
      [disabled]="chat.isLoading() || saveState() === 'saving'"
      (click)="reload.emit()"
    >
      Reload saved conversation
    </button>
    @if (chat.isLoading()) {
      <p role="status">Waiting for a reply...</p>
    }
    @if (chat.error()) {
      <p role="alert">
        The request failed. The saved conversation is unchanged.
      </p>
    }
    @if (saveState() === 'saving') {
      <p role="status">Saving conversation...</p>
    }
    @if (saveState() === 'saved' && !chat.isLoading() && !chat.error()) {
      <p role="status">Saved on the server</p>
    }
    @if (saveState() === 'failed') {
      <p role="alert">
        {{ issue() }} Keep this page open to retain unsaved messages. Reload
        replaces them with the saved conversation.
      </p>
    }
    <ol aria-label="Conversation">
      @for (message of visibleMessages(); track $index) {
        <li>
          <strong>{{ message.role }}: </strong>{{ messageText(message) }}
        </li>
      }
    </ol>
  `,
})
export class ServerThread {
  private readonly initial = (() => {
    const loaded = inject(ServerConversations).snapshot();
    if (!loaded)
      throw new Error('Load a conversation before creating its runtime.');
    return loaded;
  })();
  readonly busy = output<boolean>();
  readonly reload = output<void>();
  protected readonly prompt = signal(
    'My name is Sam. Say hello in one sentence.',
  );
  protected readonly saveState = signal<'saved' | 'saving' | 'failed'>('saved');
  protected readonly issue = signal<string | null>(null);
  protected readonly visibleMessages = signal<
    Chat.Message<string, Chat.AnyTool>[]
  >([]);
  private saved = {
    version: this.initial.version,
    encoded: encodeTextHistory(this.initial.messages),
  };
  private inFlight = false;
  private failed = false;
  private controller: AbortController | null = null;
  protected readonly chat = chatResource({
    system:
      'You are a friendly onboarding assistant. Keep each reply to one sentence.',
    threadId: this.initial.id,
    messages: restoreTextMessages(this.initial.messages),
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.controller?.abort());
    effect(() => {
      if (this.chat.error()) {
        this.busy.emit(false);
        return;
      }
      const messages = this.chat.value();
      this.visibleMessages.set(messages);
      if (this.chat.isLoading() || this.inFlight || this.failed) return;
      let encoded: string;
      try {
        encoded = encodeTextHistory(messages);
      } catch {
        this.failed = true;
        this.saveState.set('failed');
        this.issue.set('Only completed text conversations can be saved.');
        this.busy.emit(false);
        return;
      }
      if (encoded === this.saved.encoded) {
        this.busy.emit(false);
        return;
      }
      this.inFlight = true;
      this.busy.emit(true);
      this.saveState.set('saving');
      const controller = new AbortController();
      this.controller = controller;
      void saveServerHistory(
        this.initial.id,
        this.saved.version,
        messages,
        controller.signal,
      )
        .then(
          (result) => {
            if (controller.signal.aborted) return;
            this.saved = { version: result.version, encoded };
            this.saveState.set('saved');
          },
          (error: unknown) => {
            if (controller.signal.aborted) return;
            this.failed = true;
            this.saveState.set('failed');
            this.issue.set(
              error instanceof Error ? error.message : 'Saving failed.',
            );
          },
        )
        .finally(() => {
          if (!controller.signal.aborted) {
            this.inFlight = false;
            this.busy.emit(false);
          }
        });
    });
  }

  protected onInput(event: Event): void {
    this.prompt.set((event.currentTarget as HTMLInputElement).value);
  }
  protected send(): void {
    if (
      this.chat.isLoading() ||
      this.inFlight ||
      this.failed ||
      !this.prompt().trim()
    )
      return;
    this.busy.emit(true);
    this.chat.sendMessage({ role: 'user', content: this.prompt() });
    this.prompt.set('');
  }
  protected messageText(message: Chat.Message<string, Chat.AnyTool>): string {
    return 'content' in message && typeof message.content === 'string'
      ? message.content
      : 'Activity received';
  }
}

/** Loads server-owned history before mounting a fresh runtime for the selected thread. */
@Component({
  selector: 'app-server-conversations',
  imports: [ServerThread],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <h1>A conversation saved on the server</h1>
      <label for="conversation">Conversation</label>
      <select
        id="conversation"
        [value]="selectedId()"
        [disabled]="busy()"
        (change)="select($event)"
      >
        <option value="personal">Personal</option>
        <option value="work">Work</option>
      </select>
      @if (issue()) {
        <p role="alert">{{ issue() }}</p>
      } @else if (!snapshot()) {
        <p role="status">Loading saved conversation...</p>
      }
      @for (
        active of snapshot() ? [snapshot()!] : [];
        track active.id + ':' + revision()
      ) {
        <app-server-thread (busy)="busy.set($event)" (reload)="reload()" />
      }
      @if (!snapshot() && issue()) {
        <button type="button" (click)="reload()">
          Reload saved conversation
        </button>
      }
    </main>
  `,
})
export class ServerConversations {
  private generation = 0;
  readonly snapshot = signal<ServerHistory | null>(null);
  protected readonly selectedId = signal<ThreadId>('personal');
  protected readonly revision = signal(0);
  protected readonly busy = signal(false);
  protected readonly issue = signal<string | null>(null);

  constructor() {
    effect((onCleanup) => {
      const id = this.selectedId();
      this.revision();
      const current = this.generation;
      const controller = new AbortController();
      this.snapshot.set(null);
      this.issue.set(null);
      void loadServerHistory(id, controller.signal).then(
        (loaded) => {
          if (!controller.signal.aborted && this.generation === current)
            this.snapshot.set(loaded);
        },
        (error: unknown) => {
          if (!controller.signal.aborted && this.generation === current)
            this.issue.set(
              error instanceof Error ? error.message : 'Loading failed.',
            );
        },
      );
      onCleanup(() => controller.abort());
    });
  }

  protected select(event: Event): void {
    const id = (event.currentTarget as HTMLSelectElement).value;
    if (
      this.busy() ||
      id === this.selectedId() ||
      (id !== 'personal' && id !== 'work')
    )
      return;
    this.generation += 1;
    this.snapshot.set(null);
    this.selectedId.set(id);
  }
  protected reload(): void {
    this.generation += 1;
    this.snapshot.set(null);
    this.revision.update((value) => value + 1);
  }
}
