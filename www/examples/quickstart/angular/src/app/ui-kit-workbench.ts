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
  createUiKit,
  exposeComponent,
  RenderMessageComponent,
  uiChatResource,
} from '@hashbrownai/angular';
import {
  createWorkbenchStore,
  isCurrentWorkbenchError,
} from '../../../runtime/workbench';
import { getWorkbenchLesson } from '../../../runtime/workbench-lessons';
import {
  getWorkbenchUiComponents,
  getWorkbenchUiSystem,
  workbenchUiPlanProps,
} from '../../../runtime/workbench-ui-kits';
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

/** Displays the framework fallback while required SDK props resolve. */
@Component({
  selector: 'app-kit-fallback',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p class="wb-muted" data-kit-fallback role="status">
    Waiting for required plan fields…
  </p>`,
})
export class KitFallback {}

/** Owns the Angular runtime and the capture session shared with trusted cards. */
@Injectable()
export class UiKitWorkbenchSession {
  readonly lesson = getWorkbenchLesson(window.location.search);
  readonly uiLesson =
    this.lesson.id === 'ui-chatbot' ? 'ui-chatbot' : 'ui-kits';
  readonly active = signal(false);
  readonly mounted = signal(false);
  private alive = true;
  readonly store = createWorkbenchStore('ui', { uiLesson: this.uiLesson });
  readonly kit = createUiKit({
    components: getWorkbenchUiComponents(this.uiLesson).map(
      ({ name, description }) =>
        exposeComponent(
          name === 'StepsCard'
            ? StepsCard
            : name === 'PlanReading'
              ? PlanReading
              : KitSummaryCard,
          {
            name,
            description,
            input: workbenchUiPlanProps,
            children: false,
            fallback: KitFallback,
          },
        ),
    ),
  });
  readonly snapshot = signal(this.store.getSnapshot());
  readonly users = signal<Readonly<Record<string, ProposalOrigin>>>({});
  readonly chat = uiChatResource({
    system: getWorkbenchUiSystem(this.uiLesson),
    components: [this.kit],
    transport: createWorkbenchTransport(
      this.store,
      undefined,
      this.lesson.endpoint,
    ),
    tools: [
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
    const kit = this.kit;
    this.store.recordUiKit({
      registryMap: kit.registry,
      serializedSchema: kit.serializedSchema,
    });
    const unsubscribe = this.store.subscribe(() =>
      this.snapshot.set(this.store.getSnapshot()),
    );
    inject(DestroyRef).onDestroy(() => {
      this.alive = false;
      this.mounted.set(false);
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
      if (
        !this.isActive() ||
        snapshot.cursor !== null ||
        snapshot.status !== 'loading'
      )
        return;
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
      if (
        !message ||
        this.origins()[message.id]?.turn !== snapshot.turn ||
        this.origins()[message.id]?.revision !== snapshot.application.revision
      )
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
  /** Requires a mounted, selected conversation for live callbacks. */
  isActive(): boolean {
    return this.alive && this.active() && this.mounted();
  }
  /** Captures the user origin before handing the message to Hashbrown. */
  send(content: string): void {
    if (
      !this.isActive() ||
      this.store.getSnapshot().cursor !== null ||
      this.store.getSnapshot().status === 'loading'
    )
      return;
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
  selector: 'app-ui-kit-workbench-answer',
  imports: [RenderMessageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<hb-render-message [message]="message()" />`,
})
export class UiKitWorkbenchAnswer {
  readonly message =
    input.required<
      NonNullable<
        ReturnType<UiKitWorkbenchSession['chat']['lastAssistantMessage']>
      >
    >();
  readonly origin = input.required<ProposalOrigin>();
}

/** Proposes validated plan fields with explicit current-origin acceptance. */
@Component({
  selector: 'app-kit-summarycard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<article
    class="wb-summary"
    data-ui-component="SummaryCard"
    aria-label="Summary card"
  >
    <span class="wb-muted">SummaryCard · trusted component</span>
    <h2>{{ title() }}</h2>
    <ol>
      @for (step of steps(); track $index) {
        <li>{{ step }}</li>
      }
    </ol>
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
  </article>`,
})
export class KitSummaryCard {
  readonly title = input.required<string>();
  readonly steps = input.required<string[]>();
  private readonly session = inject(UiKitWorkbenchSession);
  private readonly origin = inject(UiKitWorkbenchAnswer).origin();
  protected readonly used = signal(false);
  protected readonly allowed = computed(
    () =>
      this.session.isActive() &&
      this.session.snapshot().frame?.uiComponent === 'SummaryCard' &&
      canAcceptSummary(
        this.session.snapshot(),
        this.origin,
        { title: this.title(), steps: this.steps() },
        this.used(),
      ),
  );
  protected accept(): void {
    const proposal: SummaryProps = { title: this.title(), steps: this.steps() };
    const snapshot = this.session.store.getSnapshot();
    if (
      this.session.isActive() &&
      snapshot.frame?.uiComponent === 'SummaryCard' &&
      canAcceptSummary(snapshot, this.origin, proposal, this.used()) &&
      this.session.store.accept(proposal)
    )
      this.used.set(true);
  }
}
/** Proposes validated plan fields with explicit current-origin acceptance. */
@Component({
  selector: 'app-kit-stepscard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<article
    class="wb-summary wb-steps"
    data-ui-component="StepsCard"
    aria-label="Steps card"
  >
    <span class="wb-muted">StepsCard · trusted component</span>
    <h2>{{ title() }}</h2>
    <ol>
      @for (step of steps(); track $index) {
        <li>{{ step }}</li>
      }
    </ol>
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
  </article>`,
})
export class StepsCard {
  readonly title = input.required<string>();
  readonly steps = input.required<string[]>();
  private readonly session = inject(UiKitWorkbenchSession);
  private readonly origin = inject(UiKitWorkbenchAnswer).origin();
  protected readonly used = signal(false);
  protected readonly allowed = computed(
    () =>
      this.session.isActive() &&
      this.session.snapshot().frame?.uiComponent === 'StepsCard' &&
      canAcceptSummary(
        this.session.snapshot(),
        this.origin,
        { title: this.title(), steps: this.steps() },
        this.used(),
      ),
  );
  protected accept(): void {
    const proposal: SummaryProps = { title: this.title(), steps: this.steps() };
    const snapshot = this.session.store.getSnapshot();
    if (
      this.session.isActive() &&
      snapshot.frame?.uiComponent === 'StepsCard' &&
      canAcceptSummary(snapshot, this.origin, proposal, this.used()) &&
      this.session.store.accept(proposal)
    )
      this.used.set(true);
  }
}
/** Displays model-reported values without an application action. */
@Component({
  selector: 'app-kit-plan-reading',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<article
    class="wb-summary"
    data-ui-component="PlanReading"
    aria-label="Plan reading"
  >
    <span class="wb-muted">PlanReading · read-only model report</span>
    <h2>{{ title() }}</h2>
    <ol>
      @for (step of steps(); track $index) {
        <li>{{ step }}</li>
      }
    </ol>
    <p class="wb-muted">State shows the authoritative accepted plan.</p>
  </article>`,
})
export class PlanReading {
  readonly title = input.required<string>();
  readonly steps = input.required<string[]>();
}

/** Runs the same captured workbench with Angular's real Hashbrown UI resource. */
@Component({
  selector: 'app-ui-kit-workbench-conversation',
  imports: [UiKitWorkbenchAnswer],
  providers: [UiKitWorkbenchSession],
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
          <app-ui-kit-workbench-answer
            [message]="message"
            [origin]="session.origins()[message.id] ?? unknownOrigin"
          />
        } @else if (message.role === 'error') {
          <p role="alert">The request failed. Send a message to try again.</p>
        }
      }
    </div>`,
})
export class UiKitWorkbenchConversation implements AfterViewInit {
  readonly active = input.required<boolean>();
  readonly navigation = input.required<WorkbenchNavigation>();
  private readonly mounted = signal<ReturnType<typeof mountWorkbench> | null>(
    null,
  );
  constructor() {
    effect(() => {
      const mounted = this.mounted();
      this.session.active.set(this.active());
      if (!mounted) return;
      mounted.navigation(this.navigation());
      if (!this.active()) {
        this.session.stop();
        mounted.pause();
      }
    });
  }
  protected readonly session = inject(UiKitWorkbenchSession);
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
      },
    );
    mounted.live.append(this.live().nativeElement);
    this.session.mounted.set(true);
    this.session.active.set(this.active());
    this.mounted.set(mounted);
    this.destroyRef.onDestroy(() => {
      this.session.mounted.set(false);
      this.session.stop();
      mounted.dispose();
    });
  }
}
