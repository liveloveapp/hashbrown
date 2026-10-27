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
  untracked,
  viewChild,
} from '@angular/core';
import {
  chatResource,
  createTool,
  injectJsonParser,
} from '@hashbrownai/angular';
import { createWorkbenchStore } from '../../../runtime/workbench';
import {
  observeAuthoring,
  workbenchAuthoringSchema,
  workbenchFormsSystem,
  workbenchParserSystem,
} from '../../../runtime/workbench-authoring';
import {
  currentAuthoringAssistant,
  mountAuthoringControls,
} from '../../../runtime/workbench-authoring-controls';
import {
  createHistoryActions,
  observeHistory,
} from '../../../runtime/workbench-history-client';
import { getWorkbenchLesson } from '../../../runtime/workbench-lessons';
import { createWorkbenchTransport } from '../../../runtime/workbench-transport';
import {
  mountWorkbench,
  stopWorkbench,
  type WorkbenchNavigation,
} from '../../../runtime/workbench-view';

/** Owns actual Angular text and parser resources and an independently captured application review. */
@Injectable()
export class AuthoringWorkbenchSession {
  readonly lesson = getWorkbenchLesson(window.location.search);
  readonly store = createWorkbenchStore(
    'history',
    this.lesson.id === 'agent-decisions'
      ? {}
      : {
          authoringMode: this.lesson.id === 'natural-forms' ? 'form' : 'parser',
        },
  );
  readonly snapshot = signal(this.store.getSnapshot());
  readonly active = signal(false);
  readonly chat = chatResource({
    system:
      this.lesson.id === 'natural-forms'
        ? workbenchFormsSystem
        : this.lesson.id === 'agent-decisions'
          ? 'Explain the application-owned two-step plan through server-owned read-only routes.'
          : workbenchParserSystem,
    tools:
      this.lesson.id === 'natural-forms'
        ? [
            createTool({
              name: 'readContext',
              description:
                'Read the actual applied application plan and revision without changing state.',
              handler: async () => {
                const result = this.store.getSnapshot().application;
                this.store.record('tool', { name: 'readContext', result });
                return result;
              },
            }),
          ]
        : [],
    transport: createWorkbenchTransport(
      this.store,
      undefined,
      this.lesson.endpoint,
    ),
  });
  private readonly healthy = signal<ReturnType<typeof this.chat.value>>([]);
  private readonly messages = computed(() =>
    this.chat.error() ? this.healthy() : this.chat.value(),
  );
  private readonly assistant = computed(() =>
    currentAuthoringAssistant(this.snapshot(), this.messages()),
  );
  private readonly assistantId = computed(() => this.assistant()?.id ?? null);
  private readonly json = computed(() =>
    this.lesson.id === 'agent-decisions' ? '' : (this.assistant()?.json ?? ''),
  );
  readonly parser = injectJsonParser(this.json, workbenchAuthoringSchema);
  readonly actions = createHistoryActions(
    this.store,
    () => this.observation(),
    (messages) => this.chat.setMessages(messages),
    () => window.localStorage,
    () => this.active(),
  );
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
      if (!this.chat.error()) this.healthy.set(this.chat.value());
      const observation = this.observation();
      const authoring = {
        assistantId: this.assistantId(),
        json: this.json(),
        value: this.parser.value(),
        complete: this.parser.parserState().complete,
        error: this.parser.error(),
      };
      // Store reads must not subscribe this SDK observer to review edits or its own capture writes.
      untracked(() => {
        observeHistory(this.store, observation);
        if (this.lesson.id !== 'agent-decisions')
          observeAuthoring(this.store, authoring);
      });
    });
  }
  private observation() {
    return {
      messages: this.messages(),
      error: this.chat.error(),
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
  /** Sends only explicit current live prompts after every actual SDK guard passes. */
  send(content: string): void {
    if (!this.actions.sendable()) return;
    const message = this.store.send(content);
    try {
      this.chat.sendMessage(message);
    } catch (error) {
      this.actions.failSend(error);
    }
  }
  /** Cancels the real resource on stop, switch and teardown. */
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
}

/** Hosts the shared immutable capture readout and stable application-owned form controls. */
@Component({
  selector: 'app-authoring-workbench-conversation',
  providers: [AuthoringWorkbenchSession],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<div #shell></div>',
})
export class AuthoringWorkbenchConversation implements AfterViewInit {
  readonly active = input.required<boolean>();
  readonly navigation = input.required<WorkbenchNavigation>();
  protected readonly session = inject(AuthoringWorkbenchSession);
  private readonly shell = viewChild.required<ElementRef<HTMLElement>>('shell');
  private readonly mounted = signal<ReturnType<typeof mountWorkbench> | null>(
    null,
  );
  private controls: ReturnType<typeof mountAuthoringControls> | null = null;
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
      this.controls?.render();
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
    this.controls = mountAuthoringControls(
      mounted.live,
      this.session.store,
      this.session.lesson.id,
      () => this.session.active(),
    );
    this.mounted.set(mounted);
    this.destroyRef.onDestroy(() => {
      this.session.active.set(false);
      this.session.stop();
      this.controls?.dispose();
      mounted.dispose();
    });
  }
}
