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
import { structuredChatResource } from '@hashbrownai/angular';
import {
  createWorkbenchStore,
  getWorkbenchPlanSchema,
  workbenchStructuredProps,
} from '../../../runtime/workbench';
import { getWorkbenchLesson } from '../../../runtime/workbench-lessons';
import {
  createWorkbenchLocalTransport,
  workbenchLocalModelSystem,
} from '../../../runtime/workbench-local-models';
import {
  canAcceptWorkbenchLocalPlan,
  createWorkbenchLocalController,
  mountWorkbenchLocalControls,
  observeWorkbenchLocalRun,
} from '../../../runtime/workbench-local-controls';
import {
  messageOrigins,
  mountWorkbench,
  type ProposalOrigin,
  readWorkbenchMessages,
  stopWorkbench,
  type SummaryProps,
  type WorkbenchNavigation,
} from '../../../runtime/workbench-view';

/** Owns Angular's genuine local structured resource and explicit preparation operation. */
@Injectable()
export class LocalModelsWorkbenchSession {
  readonly store = createWorkbenchStore('structured', { localModel: true });
  readonly snapshot = signal(this.store.getSnapshot());
  readonly active = signal(true);
  readonly users = signal<Readonly<Record<string, ProposalOrigin>>>({});
  readonly preparation = createWorkbenchLocalController({
    store: this.store,
    active: () => this.active(),
  });
  readonly chat = structuredChatResource({
    system: workbenchLocalModelSystem,
    schema: getWorkbenchPlanSchema('local-models'),
    transport: createWorkbenchLocalTransport(this.store),
  });
  private readonly history = signal<ReturnType<typeof this.chat.value>>([]);
  readonly messages = computed(() =>
    readWorkbenchMessages(this.chat.error(), this.chat.value, this.history()),
  );
  readonly origins = computed(() =>
    messageOrigins(this.messages(), this.users()),
  );
  private previousError: unknown;
  constructor() {
    const unsubscribe = this.store.subscribe(() =>
      this.snapshot.set(this.store.getSnapshot()),
    );
    inject(DestroyRef).onDestroy(() => {
      this.active.set(false);
      this.stop();
      this.preparation.dispose();
      unsubscribe();
    });
    effect(() => {
      if (!this.chat.error()) this.history.set(this.chat.value());
    });
    effect(() => {
      this.snapshot();
      observeWorkbenchLocalRun(this.store, {
        active: this.active(),
        messages: this.messages(),
        origins: this.origins(),
        busy:
          this.chat.isLoading() ||
          this.chat.isSending() ||
          this.chat.isReceiving() ||
          this.chat.isGenerating() ||
          this.chat.isResuming(),
        error: this.chat.error(),
        previousError: this.previousError,
        finishReason: this.chat.lastRunFinishReason(),
        interrupted:
          !!this.chat.pendingInterrupts() || this.chat.recovery().required,
      });
    });
  }
  /** Captures the current application origin before handing a user message to Hashbrown. */
  send(content: string): void {
    if (
      !this.preparation.canSend() ||
      this.chat.isLoading() ||
      this.chat.isSending() ||
      this.chat.isReceiving() ||
      this.chat.isGenerating() ||
      this.chat.isResuming() ||
      this.chat.pendingInterrupts() ||
      this.chat.recovery().required
    )
      return;
    this.previousError = this.chat.error();
    const message = this.store.send(content);
    const snapshot = this.store.getSnapshot();
    this.users.update((prior) => ({
      ...prior,
      [message.id]: {
        turn: snapshot.turn,
        revision: snapshot.application.revision,
      },
    }));
    this.history.set([...this.messages(), message]);
    this.chat.sendMessage(message);
  }
  /** Invalidates preparation and source acceptance before stopping native work. */
  stop(): void {
    this.preparation.stop();
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

/** Renders typed local previews with current-source, original-document acceptance. */
@Component({
  selector: 'app-local-models-workbench-plan',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<article class="wb-summary" aria-label="Summary card">
    <span class="wb-muted">Typed plan · application component</span>
    <h2>{{ title() || 'Building your plan…' }}</h2>
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
export class LocalModelsPlanCard {
  readonly title = input.required<string>();
  readonly steps = input.required<readonly string[]>();
  readonly origin = input.required<ProposalOrigin>();
  private readonly session = inject(LocalModelsWorkbenchSession);
  protected readonly used = signal(false);
  protected readonly allowed = computed(() =>
    canAcceptWorkbenchLocalPlan(
      this.session.snapshot(),
      this.origin(),
      { title: this.title(), steps: this.steps() },
      this.used(),
    ),
  );
  protected accept(): void {
    const proposal: SummaryProps = { title: this.title(), steps: this.steps() };
    if (
      canAcceptWorkbenchLocalPlan(
        this.session.store.getSnapshot(),
        this.origin(),
        proposal,
        this.used(),
      ) &&
      this.session.store.accept(proposal)
    )
      this.used.set(true);
  }
}

/** Mounts Angular's native local chat in the canonical workbench with inert captured replay. */
@Component({
  selector: 'app-local-models-workbench-conversation',
  imports: [LocalModelsPlanCard],
  providers: [LocalModelsWorkbenchSession],
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
          @if (planProps(message.content); as plan) {
            <app-local-models-workbench-plan
              [title]="plan.title ?? ''"
              [steps]="plan.steps ?? []"
              [origin]="session.origins()[message.id] ?? unknownOrigin"
            />
          }
        } @else if (message.role === 'error') {
          <p role="alert">
            Local generation failed. Send a message to try again.
          </p>
        }
      }
    </div>`,
})
export class LocalModelsWorkbenchConversation implements AfterViewInit {
  readonly active = input.required<boolean>();
  readonly navigation = input.required<WorkbenchNavigation>();
  protected readonly session = inject(LocalModelsWorkbenchSession);
  protected readonly planProps = workbenchStructuredProps;
  protected readonly unknownOrigin: ProposalOrigin = { turn: -1, revision: -1 };
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
    const mounted = mountWorkbench(
      this.shell().nativeElement,
      this.session.store,
      {
        framework: 'Angular',
        lesson: getWorkbenchLesson(window.location.search),
        send: (content) => this.session.send(content),
        stop: () => this.session.stop(),
        reset: () => {
          if (this.session.preparation.mutable()) this.navigation().create();
        },
      },
    );
    const controls = mountWorkbenchLocalControls(
      this.shell().nativeElement.querySelector<HTMLElement>(
        '.wb-chat .wb-panel-head',
      ) ?? mounted.live,
      this.session.store,
      this.session.preparation,
    );
    mounted.live.append(this.live().nativeElement);
    this.mounted.set(mounted);
    this.destroyRef.onDestroy(() => {
      controls.dispose();
      mounted.dispose();
    });
  }
}
