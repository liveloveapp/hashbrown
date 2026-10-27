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
import { getWorkbenchLesson } from '../../../runtime/workbench-lessons';
import { createWorkbenchTransport } from '../../../runtime/workbench-transport';
import {
  mountWorkbench,
  readWorkbenchMessages,
  stopWorkbench,
  type WorkbenchNavigation,
} from '../../../runtime/workbench-view';
import {
  canEditWorkflowState,
  readWorkflowForm,
  workflowResumeOptions,
} from '../../../runtime/workbench-workflow-form';
import {
  isWorkbenchWorkflowProgress,
  isWorkbenchWorkflowState,
  workbenchWorkflowInitialState,
  workbenchWorkflowPlan,
  workbenchWorkflowSystem,
} from '../../../runtime/workbench-workflows';

/** Owns one real Angular workflow resource and its immutable application form history. */
@Injectable()
export class WorkflowWorkbenchSession {
  readonly store = createWorkbenchStore('workflow');
  readonly snapshot = signal(this.store.getSnapshot());
  readonly localError = signal('');
  readonly visibleError = computed(
    () =>
      (this.snapshot().cursor === null ? this.localError() : '') ||
      this.workflow()?.error,
  );
  readonly chat = chatResource({
    system: workbenchWorkflowSystem,
    state: workbenchWorkflowInitialState,
    transport: createWorkbenchTransport(
      this.store,
      undefined,
      getWorkbenchLesson(window.location.search).endpoint,
    ),
  });
  private readonly history = signal<ReturnType<typeof this.chat.value>>([]);
  readonly messages = computed(() =>
    readWorkbenchMessages(this.chat.error(), this.chat.value, this.history()),
  );
  readonly selectedStatus = computed(
    () => this.snapshot().frame?.status ?? this.snapshot().status,
  );
  readonly workflow = computed(() => this.snapshot().frame?.workflow);
  readonly form = computed(() => readWorkflowForm(this.snapshot()));
  readonly title = computed(
    () =>
      this.form().title ??
      this.workflow()?.state?.planTitle ??
      workbenchWorkflowInitialState.planTitle,
  );
  readonly editable = computed(() => canEditWorkflowState(this.snapshot()));
  constructor() {
    const unsubscribe = this.store.subscribe(() =>
      this.snapshot.set(this.store.getSnapshot()),
    );
    inject(DestroyRef).onDestroy(() => {
      unsubscribe();
      this.stop();
    });
    effect(() => {
      if (!this.chat.error()) this.history.set(this.chat.value());
    });
    effect(() => {
      const error = this.chat.error();
      const accepted = this.store.recordWorkflow({
        state: this.chat.state(),
        messages: this.messages(),
        pendingInterrupts: this.chat.pendingInterrupts(),
        isLoading: this.chat.isLoading(),
        isResuming: this.chat.isResuming(),
        error,
        finishReason: this.chat.lastRunFinishReason(),
        recoveryRequired: this.chat.recovery().required,
      });
      if (
        accepted &&
        this.store.getSnapshot().status === 'loading' &&
        !this.chat.isLoading() &&
        !this.chat.isResuming() &&
        !this.chat.pendingInterrupts() &&
        (error ||
          this.chat.lastRunFinishReason() ||
          this.chat.recovery().required)
      )
        this.store.settle(
          error ||
            this.chat.recovery().required ||
            this.chat.lastRunFinishReason() !== 'stop'
            ? 'error'
            : 'complete',
          this.chat.lastRunFinishReason(),
        );
    });
  }
  /** Sends only explicit prompts and preserves the SDK's real conversation identity. */
  send(content: string): void {
    if (this.store.getSnapshot().frame?.workflow?.recoveryRequired) return;
    this.localError.set('');
    const message = this.store.send(content);
    this.history.set([...this.messages(), message]);
    try {
      this.chat.sendMessage(message);
    } catch (error) {
      this.store.settle('error');
      this.localError.set(String(error));
    }
  }
  /** Stops live work without turning pending approvals into declined answers. */
  stop(): void {
    stopWorkbench(this.store, {
      isLoading: this.chat.isLoading(),
      isResuming: this.chat.isResuming(),
      stop: () => this.chat.stop(),
    });
  }
  /** Captures the application draft without writing SDK state or starting a request. */
  editTitle(title: string): void {
    if (canEditWorkflowState(this.store.getSnapshot()))
      this.store.record('form', { type: 'state-title-draft', title });
  }
  /** Applies one complete validated state value through the actual SDK setter. */
  applyState(): void {
    if (!canEditWorkflowState(this.store.getSnapshot())) return;
    const state = {
      ...(this.chat.state() ?? workbenchWorkflowInitialState),
      planTitle:
        readWorkflowForm(this.store.getSnapshot()).title ?? this.title(),
    };
    if (!isWorkbenchWorkflowState(state)) return;
    try {
      this.chat.setState(state);
    } catch (error) {
      this.localError.set(String(error));
    }
  }
  /** Records a local answer only for the current live original batch. */
  answer(batchId: string, interruptId: string, answer: string): void {
    const snapshot = this.store.getSnapshot();
    if (
      !workflowResumeOptions(snapshot, batchId, {}, true) ||
      !['', 'approve', 'decline'].includes(answer)
    )
      return;
    this.store.record('form', {
      type: 'approval-draft',
      batchId,
      answers: { ...readWorkflowForm(snapshot).answers, [interruptId]: answer },
    });
  }
  /** Claims synchronously before submitting all responses to the SDK resume API. */
  resume(batchId: string, cancel = false): void {
    const snapshot = this.store.getSnapshot();
    const options = workflowResumeOptions(
      snapshot,
      batchId,
      readWorkflowForm(snapshot).answers,
      cancel,
    );
    if (!options || !this.store.beginResume(batchId)) return;
    this.localError.set('');
    try {
      this.chat.resume(options);
    } catch (error) {
      this.store.failResume();
      this.localError.set(String(error));
    }
  }
}

/** Renders framework-owned state, activity and approval controls from selected SDK frames. */
@Component({
  selector: 'app-workflow-workbench-conversation',
  providers: [WorkflowWorkbenchSession],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #shell></div>
    <div #live>
      <article
        class="wb-summary wb-workflow-state"
        aria-label="Shared SDK state"
      >
        <span class="wb-muted">Application-owned plan · local form draft</span>
        <ol>
          @for (step of plan.steps; track step) {
            <li>{{ step }}</li>
          }
        </ol>
        <label
          >Plan title<input
            aria-label="Plan title"
            [value]="session.title()"
            maxlength="120"
            [disabled]="!active() || !session.editable()"
            (input)="active() && session.editTitle($any($event.target).value)"
        /></label>
        <button
          type="button"
          [disabled]="
            !active() || !session.editable() || !session.title().trim()
          "
          (click)="active() && session.applyState()"
        >
          Set shared state
        </button>
        <p>
          SDK state:
          {{ session.workflow()?.state?.planTitle ?? initial.planTitle }} ·
          {{ session.workflow()?.state?.status ?? 'idle' }}
        </p>
        <p class="wb-muted">
          {{
            session.selectedStatus() === 'loading'
              ? 'Draft · request running'
              : session.selectedStatus() === 'paused'
                ? 'Paused · awaiting both answers'
                : session.selectedStatus() === 'complete'
                  ? 'Committed SDK state'
                  : session.selectedStatus() === 'error' ||
                      session.selectedStatus() === 'cancelled'
                    ? 'Request ended · SDK rollback shown'
                    : 'No request until Send'
          }}
        </p>
      </article>
      @for (message of session.workflow()?.messages ?? []; track message.id) {
        @if (message.role === 'user' || message.role === 'assistant') {
          <p
            [class.wb-user]="message.role === 'user'"
            [class.wb-workflow-reply]="message.role === 'assistant'"
          >
            {{ text(message.content) }}
          </p>
        } @else if (
          message.role === 'activity' &&
          message.activityType === 'plan-progress' &&
          validProgress(message.content)
        ) {
          <article
            class="wb-summary wb-workflow-activity"
            [attr.data-activity-id]="message.id"
          >
            <span class="wb-muted">SDK activity · {{ message.id }}</span>
            <p>{{ $any(message.content).label }}</p>
            <p>{{ $any(message.content).stage }}</p>
            <pre>{{ json(message.links ?? message.hashbrownLinks ?? {}) }}</pre>
          </article>
        }
      }
      @if (session.workflow()?.pendingInterrupts; as batch) {
        <article
          class="wb-summary wb-workflow-approvals"
          [attr.data-batch-id]="batch.id"
        >
          <h2>Review both approvals</h2>
          <p class="wb-muted">Application form · original SDK batch</p>
          @for (interrupt of batch.interrupts; track interrupt.id) {
            <label
              >{{ interrupt.message ?? 'Review this approval' }}
              <span class="wb-muted">{{ interrupt.id }}</span
              ><select
                [attr.aria-label]="'Approval ' + ($index + 1)"
                [value]="session.form().answers[interrupt.id] || ''"
                [disabled]="
                  !active() ||
                  !resumeOptions(session.snapshot(), batch.id, {}, true)
                "
                (change)="
                  active() &&
                    session.answer(
                      batch.id,
                      interrupt.id,
                      $any($event.target).value
                    )
                "
              >
                <option value="">Choose an answer</option>
                <option value="approve">Approve</option>
                <option value="decline">Decline</option>
              </select></label
            >
          }
          <button
            type="button"
            [disabled]="
              !active() ||
              !resumeOptions(
                session.snapshot(),
                batch.id,
                session.form().answers
              )
            "
            (click)="active() && session.resume(batch.id)"
          >
            Submit answers</button
          ><button
            type="button"
            [disabled]="
              !active() ||
              !resumeOptions(session.snapshot(), batch.id, {}, true)
            "
            (click)="active() && session.resume(batch.id, true)"
          >
            Cancel approvals
          </button>
        </article>
      }
      @if (session.workflow()?.isResuming) {
        <p role="status">Resuming the same turn…</p>
      }
      @if (session.workflow()?.recoveryRequired) {
        <p role="alert">
          Resume failed after acknowledgement. Start a new conversation.
        </p>
      }
      @if (session.visibleError()) {
        <p role="alert">
          {{ session.visibleError() }}
        </p>
      }
    </div>`,
})
export class WorkflowWorkbenchConversation implements AfterViewInit {
  readonly active = input.required<boolean>();
  readonly navigation = input.required<WorkbenchNavigation>();
  protected readonly session = inject(WorkflowWorkbenchSession);
  protected readonly plan = workbenchWorkflowPlan;
  protected readonly initial = workbenchWorkflowInitialState;
  protected readonly resumeOptions = workflowResumeOptions;
  protected readonly validProgress = isWorkbenchWorkflowProgress;
  protected readonly json = JSON.stringify;
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
        managedChat: true,
        lesson: getWorkbenchLesson(window.location.search),
        send: (content) => {
          if (this.active()) this.session.send(content);
        },
        stop: () => this.session.stop(),
        reset: () => this.navigation().create(),
      },
    );
    mounted.live.append(this.live().nativeElement);
    this.mounted.set(mounted);
    this.destroyRef.onDestroy(() => mounted.dispose());
  }
}
