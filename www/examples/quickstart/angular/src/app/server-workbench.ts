import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
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
import { observeHistory } from '../../../runtime/workbench-history-client';
import {
  workbenchHistorySystem,
  type WorkbenchTextDocument,
} from '../../../runtime/workbench-history';
import { getWorkbenchLesson } from '../../../runtime/workbench-lessons';
import {
  createWorkbenchServerHistory,
  getWorkbenchServerAccess,
  type WorkbenchServerLesson,
} from '../../../runtime/workbench-server-history';
import { mountWorkbenchServerControls } from '../../../runtime/workbench-server-controls';
import { createWorkbenchTransport } from '../../../runtime/workbench-transport';
import {
  mountWorkbench,
  stopWorkbench,
  type WorkbenchNavigation,
} from '../../../runtime/workbench-view';

type Replacement = {
  readonly messages: WorkbenchTextDocument['messages'];
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
  readonly applied?: boolean;
};

/** Owns actual Angular SDK identity, text and explicit application server operations. */
@Injectable()
export class ServerWorkbenchSession {
  readonly store = createWorkbenchStore('history');
  readonly snapshot = signal(this.store.getSnapshot());
  readonly active = signal(false);
  readonly lesson = getWorkbenchLesson(window.location.search);
  private readonly threadId = signal<string | undefined>(undefined);
  private readonly replacement = signal<Replacement | null>(null);
  readonly chat = chatResource({
    system: workbenchHistorySystem,
    threadId: this.threadId,
    transport: createWorkbenchTransport(
      this.store,
      undefined,
      this.lesson.endpoint,
      {
        onResponse: (response) =>
          this.controller.captureResponse(response, 'chat'),
      },
    ),
  });
  private readonly healthy = signal<ReturnType<typeof this.chat.value>>([]);
  readonly controller = createWorkbenchServerHistory({
    store: this.store,
    lesson: this.lesson.id as WorkbenchServerLesson,
    access: getWorkbenchServerAccess(window.location, this.lesson),
    observation: () => this.observation(),
    active: () => this.active(),
    replace: (id, messages) =>
      new Promise<void>((resolve, reject) => {
        this.threadId.set(id);
        this.replacement.set({ messages, resolve, reject });
      }),
  });
  constructor() {
    const unsubscribe = this.store.subscribe(() =>
      this.snapshot.set(this.store.getSnapshot()),
    );
    inject(DestroyRef).onDestroy(() => {
      this.active.set(false);
      this.replacement()?.reject(new Error('Conversation disposed'));
      this.stop();
      this.controller.dispose();
      unsubscribe();
    });
    effect(() => {
      if (!this.chat.error()) this.healthy.set(this.chat.value());
      observeHistory(this.store, this.observation());
    });
    effect(() => {
      // The SDK configuration effect was registered first and applies threadId before replacement.
      const replacement = this.replacement();
      if (!replacement) return;
      if (!this.active()) {
        replacement.reject(new Error('Conversation inactive'));
        this.replacement.set(null);
        return;
      }
      if (!replacement.applied) {
        try {
          this.chat.setMessages(
            replacement.messages.map((message) =>
              message.role === 'assistant'
                ? {
                    ...message,
                    role: 'assistant' as const,
                    toolCalls: [] as [],
                  }
                : { ...message, role: 'user' as const },
            ),
          );
          this.replacement.set({ ...replacement, applied: true });
        } catch (error) {
          replacement.reject(
            error instanceof Error ? error : new Error(String(error)),
          );
          this.replacement.set(null);
        }
        return;
      }
      observeHistory(this.store, this.observation());
      replacement.resolve();
      this.replacement.set(null);
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
  /**
   * Initializes only after the actual resource has a mounted observation.
   * Replays and hosted loopback lessons never ask the server for a session.
   */
  mount(): void {
    observeHistory(this.store, this.observation());
    if (this.controller.access === 'session') void this.controller.initialize();
  }
  /** Sends only after server identity and actual SDK replacement are ready. */
  send(content: string): void {
    if (!this.controller.sendable()) return;
    const message = this.store.send(content);
    try {
      this.chat.sendMessage(message);
    } catch (error) {
      this.store.settle('error');
      this.store.failHistoryReplacement(error);
    }
  }
  /** Cancels outstanding HTTP operations and stops the actual SDK stream. */
  stop(): void {
    this.controller.cancelPending();
    stopWorkbench(this.store, {
      isLoading: this.chat.isLoading(),
      isSending: this.chat.isSending(),
      isReceiving: this.chat.isReceiving(),
      isGenerating: this.chat.isGenerating(),
      isResuming: this.chat.isResuming(),
      stop: () => this.chat.stop(),
    });
  }
}

/** Projects captured SDK text while server mutations remain guarded by the live session. */
@Component({
  selector: 'app-server-workbench-conversation',
  providers: [ServerWorkbenchSession],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #shell></div>
    <div #live>
      @for (
        message of session.snapshot().frame?.history?.sdk?.messages ?? [];
        track $index
      ) {
        <p
          [attr.data-message-id]="message['id']"
          [class.wb-user]="message['role'] === 'user'"
          [class.wb-history-reply]="message['role'] !== 'user'"
        >
          {{ text(message['content']) }}
        </p>
      }
      @if (session.snapshot().frame?.history?.sdk?.error) {
        <p role="alert">{{ session.snapshot().frame?.history?.sdk?.error }}</p>
      }
    </div>`,
})
export class ServerWorkbenchConversation implements AfterViewInit {
  readonly active = input.required<boolean>();
  readonly navigation = input.required<WorkbenchNavigation>();
  protected readonly session = inject(ServerWorkbenchSession);
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
    const controls = mountWorkbenchServerControls(
      mounted.live,
      this.session.store,
      this.session.controller,
      'Angular',
    );
    mounted.live.append(this.live().nativeElement);
    this.mounted.set(mounted);
    this.session.mount();
    this.destroyRef.onDestroy(() => {
      this.session.active.set(false);
      this.session.stop();
      controls.dispose();
      mounted.dispose();
    });
  }
}
