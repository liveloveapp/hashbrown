import { ProductionWorkbenchConversation } from './production-workbench';
import { LocalModelsWorkbenchConversation } from './local-models-workbench';
import { RuntimeWorkbenchConversation } from './runtime-workbench';
import { UiKitWorkbenchConversation } from './ui-kit-workbench';
import { AuthoringWorkbenchConversation } from './authoring-workbench';
import { ServerWorkbenchConversation } from './server-workbench';
import { HistoryWorkbenchConversation } from './history-workbench';
import { WorkflowWorkbenchConversation } from './workflow-workbench';
import { PlanCard } from './plan-card';
import { firstPlanComponents } from './first-plan-app';
import { workbenchFirstPlanSystem } from '../../../runtime/workbench-onboarding';
import { ProseWorkbenchConversation } from './prose-workbench';
import { PredictionsWorkbenchConversation } from './predictions-workbench';
import { SelectionWorkbenchConversation } from './selection-workbench';
import { DecisionWorkbenchConversation } from './decision-workbench';
import { getWorkbenchLesson } from '../../../runtime/workbench-lessons';
import { StructuredWorkbenchConversation } from './structured-workbench';
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
import {
  createTool,
  exposeComponent,
  RenderMessageComponent,
  uiChatResource,
} from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';
import {
  createWorkbenchStore,
  isCurrentWorkbenchError,
  workbenchSystem,
} from '../../../runtime/workbench';
import { createWorkbenchTransport } from '../../../runtime/workbench-transport';
import {
  canAcceptSummary,
  messageOrigins,
  mountWorkbench,
  type ProposalOrigin,
  readWorkbenchMessages,
  stopWorkbench,
  type SummaryProps,
  type WorkbenchNavigation,
} from '../../../runtime/workbench-view';

/** Owns the Angular runtime and the capture session shared with trusted cards. */
@Injectable()
export class WorkbenchSession {
  readonly debugDenied = signal(
    getWorkbenchLesson(window.location.search).id === 'debugging',
  );
  readonly store = createWorkbenchStore();
  readonly snapshot = signal(this.store.getSnapshot());
  readonly users = signal<Readonly<Record<string, ProposalOrigin>>>({});
  readonly chat = uiChatResource({
    system:
      getWorkbenchLesson(window.location.search).id === 'first-plan'
        ? workbenchFirstPlanSystem
        : workbenchSystem,
    components:
      getWorkbenchLesson(window.location.search).id === 'first-plan'
        ? firstPlanComponents
        : components,
    transport: createWorkbenchTransport(
      this.store,
      undefined,
      getWorkbenchLesson(window.location.search).endpoint,
      { getDebugDenied: () => this.debugDenied() },
    ),
    tools:
      getWorkbenchLesson(window.location.search).id === 'first-plan'
        ? []
        : [
            createTool({
              name: 'readContext',
              description:
                'Read the accepted application plan and revision without changing state.',
              handler: async () => {
                const result = this.store.getSnapshot().application;
                this.store.record('tool', { name: 'readContext', result });
                return result;
              },
            }),
          ],
  });
  private readonly history = signal<ReturnType<typeof this.chat.value>>([]);
  readonly messages = computed(() =>
    readWorkbenchMessages(this.chat.error(), this.chat.value, this.history()),
  );
  readonly origins = computed(() =>
    messageOrigins(this.messages(), this.users()),
  );
  private readonly healthyMessages = signal<ReturnType<typeof this.chat.value>>(
    [],
  );
  private recorded = '';
  private previousError: unknown;
  constructor() {
    const unsubscribe = this.store.subscribe(() =>
      this.snapshot.set(this.store.getSnapshot()),
    );
    inject(DestroyRef).onDestroy(() => {
      unsubscribe();
      this.stop();
    });
    effect(() => {
      if (!this.chat.error()) {
        const messages = this.chat.value();
        this.history.set(messages);
        this.healthyMessages.set(messages);
      }
    });
    effect(() => {
      const snapshot = this.snapshot();
      if (snapshot.status !== 'loading') return;
      if (
        this.chat.error() &&
        isCurrentWorkbenchError(
          snapshot,
          this.healthyMessages(),
          this.chat.error(),
          this.previousError,
        )
      ) {
        this.store.settle('error');
        return;
      }
      if (this.chat.error()) return;
      const message = this.chat.lastAssistantMessage();
      if (!message || this.origins()[message.id]?.turn !== snapshot.turn)
        return;
      const serialized = JSON.stringify(message.content);
      if (serialized && serialized !== this.recorded) {
        this.recorded = serialized;
        this.store.parsed(message.content);
      }
      if (!this.chat.isLoading() && this.chat.lastRunFinishReason())
        this.store.settle(
          this.chat.lastRunFinishReason() === 'stop' &&
            !this.chat.pendingInterrupts()
            ? 'complete'
            : 'error',
          this.chat.lastRunFinishReason(),
        );
    });
  }
  /** Captures the user origin before handing the message to Hashbrown. */
  send(content: string): void {
    this.previousError = this.chat.error();
    const message = this.store.send(content);
    const snapshot = this.store.getSnapshot();
    this.users.update((users) => ({
      ...users,
      [message.id]: {
        turn: snapshot.turn,
        revision: snapshot.application.revision,
      },
    }));
    this.recorded = '';
    this.history.set([...this.messages(), message]);
    this.chat.sendMessage(message);
  }
  /** Invalidates acceptance before aborting the runtime. */
  stop(): void {
    stopWorkbench(this.store, {
      isLoading: this.chat.isLoading(),
      isResuming: this.chat.isResuming(),
      stop: () => this.chat.stop(),
    });
  }
  /** Clears framework history; the shell clears the capture and application state. */
  reset(): void {
    this.stop();
    this.chat.setMessages([]);
    this.history.set([]);
    this.healthyMessages.set([]);
    this.users.set({});
    this.recorded = '';
  }
}

/** Binds the trusted generated card to the origin of its assistant message. */
@Component({
  selector: 'app-workbench-answer',
  imports: [RenderMessageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<hb-render-message [message]="message()" />`,
})
export class WorkbenchAnswer {
  readonly message =
    input.required<
      NonNullable<ReturnType<WorkbenchSession['chat']['lastAssistantMessage']>>
    >();
  readonly origin = input.required<ProposalOrigin>();
}

/** Renders streaming plan props and requires explicit, current-turn acceptance. */
@Component({
  selector: 'app-workbench-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PlanCard],
  template: `<app-plan-card [title]="title()" [steps]="steps()">
    <button
      type="button"
      class="wb-primary"
      [disabled]="!allowed()"
      (click)="accept()"
    >
      {{ used() ? 'Plan accepted' : 'Accept plan' }}
    </button>
    <p class="wb-muted">
      {{
        used()
          ? 'Saved to application state.'
          : allowed()
            ? 'Ready for your review.'
            : 'Preview · unavailable for this run.'
      }}
    </p>
  </app-plan-card>`,
})
export class SummaryCard {
  readonly title = input.required<string>();
  readonly steps = input.required<string[]>();
  private readonly session = inject(WorkbenchSession);
  private readonly origin = inject(WorkbenchAnswer).origin();
  protected readonly used = signal(false);
  protected readonly allowed = computed(() =>
    canAcceptSummary(
      this.session.snapshot(),
      this.origin,
      { title: this.title(), steps: this.steps() },
      this.used(),
    ),
  );
  protected accept(): void {
    const proposal: SummaryProps = { title: this.title(), steps: this.steps() };
    if (
      canAcceptSummary(
        this.session.store.getSnapshot(),
        this.origin,
        proposal,
        this.used(),
      ) &&
      this.session.store.accept(proposal)
    )
      this.used.set(true);
  }
}
const components = [
  exposeComponent(SummaryCard, {
    name: 'SummaryCard',
    description:
      'Propose a concise plan for explicit user review and acceptance.',
    input: {
      title: s.string('A concise plan title'),
      steps: s.streaming.array(
        'The ordered plan steps',
        s.string('A clear, concise action'),
      ),
    },
    children: false,
  }),
];

/** Runs the same captured workbench with Angular's real Hashbrown UI resource. */
@Component({
  selector: 'app-workbench-conversation',
  imports: [WorkbenchAnswer],
  providers: [WorkbenchSession],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #shell></div>
    <div #live>
      @for (
        message of session.messages();
        track message.role === 'error' ? 'error-' + $index : message.id
      ) {
        @if (message.role === 'user') {
          <p class="wb-user">{{ message.content }}</p>
        } @else if (message.role === 'assistant') {
          <app-workbench-answer
            [message]="message"
            [origin]="session.origins()[message.id] ?? unknownOrigin"
          />
        } @else if (message.role === 'error') {
          <p role="alert">The request failed. Send a message to try again.</p>
        }
      }
    </div>`,
})
export class WorkbenchConversation implements AfterViewInit {
  readonly active = input.required<boolean>();
  readonly navigation = input.required<WorkbenchNavigation>();
  private readonly mounted = signal<ReturnType<typeof mountWorkbench> | null>(
    null,
  );
  constructor() {
    effect(() => {
      const mounted = this.mounted();
      if (!mounted) return;
      mounted.navigation(this.navigation());
      if (!this.active()) {
        this.session.stop();
        mounted.pause();
      }
    });
  }
  protected readonly session = inject(WorkbenchSession);
  protected readonly unknownOrigin: ProposalOrigin = { turn: -1, revision: -1 };
  private readonly shell = viewChild.required<ElementRef<HTMLElement>>('shell');
  private readonly live = viewChild.required<ElementRef<HTMLElement>>('live');
  private readonly destroyRef = inject(DestroyRef);
  ngAfterViewInit(): void {
    const mounted = mountWorkbench(
      this.shell().nativeElement,
      this.session.store,
      {
        framework: 'Angular',
        lesson: getWorkbenchLesson(window.location.search),
        send: (content) => this.session.send(content),
        stop: () => this.session.stop(),
        reset: () => this.session.reset(),
        setDebugDenied: (denied) => this.session.debugDenied.set(denied),
      },
    );
    mounted.live.append(this.live().nativeElement);
    this.mounted.set(mounted);
    this.destroyRef.onDestroy(() => mounted.dispose());
  }
}

/** Retains separate Angular resources and application captures for every conversation. */
@Component({
  selector: 'app-workbench',
  imports: [
    WorkbenchConversation,
    RuntimeWorkbenchConversation,
    UiKitWorkbenchConversation,
    WorkflowWorkbenchConversation,
    HistoryWorkbenchConversation,
    AuthoringWorkbenchConversation,
    ServerWorkbenchConversation,
    ProductionWorkbenchConversation,
    StructuredWorkbenchConversation,
    LocalModelsWorkbenchConversation,
    DecisionWorkbenchConversation,
    ProseWorkbenchConversation,
    PredictionsWorkbenchConversation,
    SelectionWorkbenchConversation,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@for (conversation of conversations(); track conversation.id) {
    @if (production) {
      <app-production-workbench-conversation
        [hidden]="conversation.id !== activeId()"
        [active]="conversation.id === activeId()"
        [navigation]="navigation(conversation.id)"
      />
    } @else if (javascriptRuntime) {
      <app-runtime-workbench-conversation
        [hidden]="conversation.id !== activeId()"
        [active]="conversation.id === activeId()"
        [navigation]="navigation(conversation.id)"
      />
    } @else if (uiKit) {
      <app-ui-kit-workbench-conversation
        [hidden]="conversation.id !== activeId()"
        [active]="conversation.id === activeId()"
        [navigation]="navigation(conversation.id)"
      />
    } @else if (server) {
      <app-server-workbench-conversation
        [hidden]="conversation.id !== activeId()"
        [active]="conversation.id === activeId()"
        [navigation]="navigation(conversation.id)"
      />
    } @else if (authoring) {
      <app-authoring-workbench-conversation
        [hidden]="conversation.id !== activeId()"
        [active]="conversation.id === activeId()"
        [navigation]="navigation(conversation.id)"
      />
    } @else if (format === 'history') {
      <app-history-workbench-conversation
        [hidden]="conversation.id !== activeId()"
        [active]="conversation.id === activeId()"
        [navigation]="navigation(conversation.id)"
      />
    } @else if (format === 'workflow') {
      <app-workflow-workbench-conversation
        [hidden]="conversation.id !== activeId()"
        [active]="conversation.id === activeId()"
        [navigation]="navigation(conversation.id)"
      />
    } @else if (format === 'text') {
      <app-prose-workbench-conversation
        [hidden]="conversation.id !== activeId()"
        [active]="conversation.id === activeId()"
        [navigation]="navigation(conversation.id)"
      />
    } @else if (format === 'predictions') {
      <app-predictions-workbench-conversation
        [hidden]="conversation.id !== activeId()"
        [active]="conversation.id === activeId()"
        [navigation]="navigation(conversation.id)"
      />
    } @else if (format === 'selection') {
      <app-selection-workbench-conversation
        [hidden]="conversation.id !== activeId()"
        [active]="conversation.id === activeId()"
        [navigation]="navigation(conversation.id)"
      />
    } @else if (decision) {
      <app-decision-workbench-conversation
        [hidden]="conversation.id !== activeId()"
        [active]="conversation.id === activeId()"
        [navigation]="navigation(conversation.id)"
      />
    } @else if (localModels) {
      <app-local-models-workbench-conversation
        [hidden]="conversation.id !== activeId()"
        [active]="conversation.id === activeId()"
        [navigation]="navigation(conversation.id)"
      />
    } @else if (structured) {
      <app-structured-workbench-conversation
        [hidden]="conversation.id !== activeId()"
        [active]="conversation.id === activeId()"
        [navigation]="navigation(conversation.id)"
      />
    } @else {
      <app-workbench-conversation
        [hidden]="conversation.id !== activeId()"
        [active]="conversation.id === activeId()"
        [navigation]="navigation(conversation.id)"
      />
    }
  }`,
})
export class Workbench {
  readonly production =
    getWorkbenchLesson(window.location.search).id === 'production-recovery';
  protected readonly javascriptRuntime =
    getWorkbenchLesson(window.location.search).id === 'javascript-runtime';
  protected readonly uiKit = ['ui-kits', 'ui-chatbot'].includes(
    getWorkbenchLesson(window.location.search).id,
  );
  protected readonly authoring = [
    'agent-decisions',
    'json-parser',
    'natural-forms',
  ].includes(getWorkbenchLesson(window.location.search).id);
  protected readonly server =
    getWorkbenchLesson(window.location.search).host === 'loopback';
  protected readonly format = getWorkbenchLesson(window.location.search).format;
  protected readonly decision =
    getWorkbenchLesson(window.location.search).format === 'decision';
  protected readonly localModels =
    getWorkbenchLesson(window.location.search).id === 'local-models';
  protected readonly structured =
    getWorkbenchLesson(window.location.search).format === 'structured';
  protected readonly conversations = signal([
    { id: '1', label: 'Two-step plan' },
  ]);
  protected readonly activeId = signal('1');
  protected navigation(id: string): WorkbenchNavigation {
    return {
      currentId: id,
      conversations: this.conversations(),
      select: (value) => this.activeId.set(value),
      create: () => this.create(),
    };
  }
  private create(): void {
    const id = String(this.conversations().length + 1);
    this.conversations.update((previous) => [
      ...previous,
      { id, label: `Conversation ${id}` },
    ]);
    this.activeId.set(id);
  }
}
