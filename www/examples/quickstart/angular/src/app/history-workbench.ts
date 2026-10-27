import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injectable,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { chatResource } from '@hashbrownai/angular';
import { createWorkbenchStore } from '../../../runtime/workbench';
import {
  createHistoryActions,
  observeHistory,
} from '../../../runtime/workbench-history-client';
import { workbenchHistorySystem } from '../../../runtime/workbench-history';
import { getWorkbenchLesson } from '../../../runtime/workbench-lessons';
import { createWorkbenchTransport } from '../../../runtime/workbench-transport';
import {
  mountWorkbench,
  stopWorkbench,
  type WorkbenchNavigation,
} from '../../../runtime/workbench-view';

/** Owns one actual text resource and separately captured application text copies. */
@Injectable()
export class HistoryWorkbenchSession {
  readonly store = createWorkbenchStore('history');
  readonly snapshot = signal(this.store.getSnapshot());
  readonly active = signal(false);
  readonly lesson = getWorkbenchLesson(window.location.search);
  readonly chat = chatResource({
    system: workbenchHistorySystem,
    transport: createWorkbenchTransport(
      this.store,
      undefined,
      this.lesson.endpoint,
    ),
  });
  private readonly healthy = signal<ReturnType<typeof this.chat.value>>([]);
  readonly history = computed(() => this.snapshot().frame?.history);
  readonly app = computed(() => this.history()?.app);
  readonly actions = createHistoryActions(
    this.store,
    () => this.observation(),
    (messages) => this.chat.setMessages(messages),
    () => window.localStorage,
    () => this.active(),
  );
  readonly mutable = computed(() => {
    this.snapshot();
    return this.actions.mutable();
  });
  readonly savable = computed(() => {
    this.snapshot();
    return this.actions.savable();
  });
  constructor() {
    const unsubscribe = this.store.subscribe(() =>
      this.snapshot.set(this.store.getSnapshot()),
    );
    inject(DestroyRef).onDestroy(() => {
      this.active.set(false);
      this.stop();
      unsubscribe();
    });
    effect(() => {
      // Resource.value throws after failure; preserve the most recent healthy streaming value.
      if (!this.chat.error()) this.healthy.set(this.chat.value());
      observeHistory(this.store, this.observation());
    });
  }
  private observation() {
    const error = this.chat.error();
    return {
      messages: error ? this.healthy() : this.chat.value(),
      error,
      isLoading: this.chat.isLoading(),
      isSending: this.chat.isSending(),
      isReceiving: this.chat.isReceiving(),
      isGenerating: this.chat.isGenerating(),
      isResuming: this.chat.isResuming(),
      finishReason: this.chat.lastRunFinishReason(),
      pendingInterrupts: this.chat.pendingInterrupts(),
      recoveryRequired: this.chat.recovery().required,
    };
  }
  /** Performs the first read only after the browser view mounts. */
  mount(): void {
    observeHistory(this.store, this.observation());
    if (this.lesson.id === 'save-text-conversations')
      this.actions.select('Lighthouse');
  }
  /** Sends explicit prompts through the actual resource after checking every live guard. */
  send(content: string): void {
    if (!this.actions.sendable()) return;
    const message = this.store.send(content);
    try {
      this.chat.sendMessage(message);
    } catch (error) {
      this.actions.failSend(error);
    }
  }
  /** Stops all actual work on conversation switches and view teardown. */
  stop(): void {
    stopWorkbench(this.store, {
      isLoading: this.chat.isLoading(),
      isSending: this.chat.isSending(),
      isReceiving: this.chat.isReceiving(),
      isGenerating: this.chat.isGenerating(),
      isResuming: this.chat.isResuming(),
      stop: () => this.chat.stop(),
    });
  }
  /** Accepts only application-owned slot names from the view. */
  select(slot: string): void {
    if (slot === 'Lighthouse' || slot === 'Harbor') this.actions.select(slot);
  }
}

/** Projects selected immutable frames while mutations target only a guarded live session. */
@Component({
  selector: 'app-history-workbench-conversation',
  providers: [HistoryWorkbenchSession],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #shell></div>
    <div #live>
      <article
        class="wb-summary wb-history-controls"
        [attr.aria-label]="
          session.lesson.id === 'save-text-conversations'
            ? 'Saved text controls'
            : 'Retained text controls'
        "
      >
        @if (session.lesson.id === 'save-text-conversations') {
          <label
            >Saved text
            <select
              aria-label="Saved text"
              [value]="session.app()?.selectedSlot ?? 'Lighthouse'"
              [disabled]="!session.mutable()"
              (change)="session.select($any($event.target).value)"
            >
              <option>Lighthouse</option>
              <option>Harbor</option>
            </select></label
          >
          <button
            type="button"
            [disabled]="!session.savable()"
            (click)="session.actions.save()"
          >
            Save text
          </button>
          <button
            type="button"
            [disabled]="
              !session.mutable() || session.app()?.saved?.status !== 'valid'
            "
            (click)="session.actions.replace('load')"
          >
            Load text
          </button>
          <button
            type="button"
            [disabled]="!session.mutable()"
            (click)="session.actions.clearSlot()"
          >
            Clear saved text
          </button>
          <p class="wb-muted">
            {{ session.app()?.selectedSlot ?? 'Lighthouse' }} ·
            {{ session.app()?.saved?.status ?? 'empty' }} · explicit application
            copy
          </p>
        } @else {
          <button
            type="button"
            [disabled]="!session.savable()"
            (click)="session.actions.keep()"
          >
            Keep completed text
          </button>
          <button
            type="button"
            [disabled]="
              !session.mutable() || !session.history()?.sdk?.messages?.length
            "
            (click)="session.actions.replace('clear')"
          >
            Clear messages
          </button>
          <button
            type="button"
            [disabled]="!session.mutable() || !session.app()?.retained"
            (click)="session.actions.replace('restore')"
          >
            Restore kept text
          </button>
          <p class="wb-muted">
            Kept text ·
            {{ session.app()?.retained?.messages?.length ?? 0 }} messages ·
            application memory
          </p>
        }
        @if (session.app()?.action) {
          <p role="status">{{ session.app()?.action }}</p>
        }
      </article>
      @for (message of session.history()?.sdk?.messages ?? []; track $index) {
        <p
          [class.wb-user]="message['role'] === 'user'"
          [class.wb-history-reply]="message['role'] !== 'user'"
        >
          {{ text(message['content']) }}
        </p>
      }
      @if (session.app()?.error || session.history()?.sdk?.error) {
        <p role="alert">
          {{ session.app()?.error || session.history()?.sdk?.error }}
        </p>
      }
    </div>`,
})
export class HistoryWorkbenchConversation implements AfterViewInit {
  readonly active = input.required<boolean>();
  readonly navigation = input.required<WorkbenchNavigation>();
  protected readonly session = inject(HistoryWorkbenchSession);
  protected readonly text = (value: unknown) =>
    typeof value === 'string' ? value : '';
  private readonly shell = viewChild.required<ElementRef<HTMLElement>>('shell');
  private readonly live = viewChild.required<ElementRef<HTMLElement>>('live');
  private readonly mounted = signal<ReturnType<typeof mountWorkbench> | null>(
    null,
  );
  private readonly destroyRef = inject(DestroyRef);
  constructor() {
    effect(() => {
      this.session.active.set(this.active());
      const mounted = this.mounted();
      if (!mounted) return;
      mounted.navigation(this.navigation());
      if (!this.active()) {
        this.session.stop();
        mounted.pause();
      }
    });
  }
  ngAfterViewInit(): void {
    this.session.active.set(this.active());
    this.session.mount();
    const mounted = mountWorkbench(
      this.shell().nativeElement,
      this.session.store,
      {
        framework: 'Angular',
        managedChat: true,
        lesson: this.session.lesson,
        send: (content) => this.session.send(content),
        stop: () => {
          if (this.active() && this.session.store.getSnapshot().cursor === null)
            this.session.stop();
        },
        reset: () => this.navigation().create(),
      },
    );
    mounted.live.append(this.live().nativeElement);
    this.mounted.set(mounted);
    this.destroyRef.onDestroy(() => {
      this.session.active.set(false);
      this.session.stop();
      mounted.dispose();
    });
  }
}
