import {
  Component,
  computed,
  DestroyRef,
  inject,
  Injectable,
  input,
  signal,
} from '@angular/core';
import type { ErrorHandler } from '@angular/core';
import type {
  ConversationRecoveryState,
  PendingConversationRecovery,
  ResumeConversationRecoveryOptions,
} from '@hashbrownai/core';
import {
  type CandidateConfiguration,
  candidateError,
  candidateFrameworkError,
  type CandidatePanelActions,
  finishCandidateConfigAction,
  openCandidateThread,
} from '../candidate-runtime';
import {
  buildCandidateRecoveryOptions,
  buildCandidateRecoveryRead,
  type CandidateRecoveryEnvelope,
  type CandidateRecoveryForm,
  createCandidateReadGuard,
  parseCandidateRecoveryEnvelope,
} from '../recovery';

/** Signal-driven escaped controls; callbacks bind directly to the mounted public resource. */
@Component({
  selector: 'candidate-panel',
  standalone: true,
  template: `
    <main data-testid="candidate-isolation-ready">
      <label
        >Prompt<textarea
          data-testid="prompt"
          [value]="prompt() ?? config().prompt"
          (input)="prompt.set(value($event))"
        ></textarea>
      </label>
      <button data-testid="start" (click)="invoke('start', start)">
        Start
      </button>
      <button data-testid="next" (click)="invoke('next', next)">
        Next message
      </button>
      <button data-testid="read" (click)="read()">
        Read retained conversation
      </button>
      <button data-testid="fresh-read" (click)="read()">
        Fresh authoritative read
      </button>
      <button data-testid="stop" (click)="invoke('stop', actions().stop)">
        Stop
      </button>
      <button data-testid="new-thread" (click)="newThread()">New thread</button>
      <button data-testid="rerender" (click)="rerenders.update(increment)">
        Rerender
      </button>
      <label
        >Structured history<select
          data-testid="structured-history"
          [value]="history()"
          (change)="setHistory(value($event))"
        >
          <option value="strict">Strict</option>
          <option value="preserve-diagnostics">Preserve diagnostics</option>
        </select></label
      >
      <pre data-testid="pending">{{ pendingJson() }}</pre>
      @if (pending(); as batch) {
        @for (call of batch.toolCalls; track call.id) {
          <fieldset>
            <legend>{{ call.id }}: {{ call.name }}</legend>
            <pre>{{ json(call.arguments) }}</pre>
            <select
              [attr.data-testid]="'outcome-status-' + call.id"
              [value]="outcome(call.id)?.status ?? ''"
              (change)="editOutcome(call.id, 'status', value($event))"
            >
              <option value="">Choose an observation</option>
              <option value="result">Known JSON result</option>
              <option value="unavailable">Result unavailable</option>
            </select>
            <textarea
              [attr.data-testid]="'outcome-value-' + call.id"
              [value]="outcome(call.id)?.json ?? ''"
              (input)="editOutcome(call.id, 'json', value($event))"
            ></textarea>
          </fieldset>
        }
        @for (interrupt of batch.interrupts; track interrupt.id) {
          <label
            >{{ interrupt.id }}: {{ interrupt.reason
            }}<select
              [attr.data-testid]="'decision-' + interrupt.id"
              [value]="decision(interrupt.id)"
              (change)="editDecision(interrupt.id, value($event))"
            >
              <option value="">Choose a decision</option>
              <option value="approve">Approve</option>
              <option value="decline">Decline</option>
              <option value="cancel">Cancel</option>
            </select></label
          >
        }
        <button data-testid="submit" (click)="submit()">
          Submit complete recovery
        </button>
      }
      @if (lastSubmission()) {
        <button
          data-testid="negative-repeat-submit"
          (click)="repeatSubmission()"
        >
          Repeat the exact submitted options
        </button>
      }
      <button data-testid="negative-stale-token" (click)="negative('stale')">
        Try former token
      </button>
      <button
        data-testid="negative-incomplete-outcomes"
        (click)="negative('outcomes')"
      >
        Try incomplete outcomes
      </button>
      @if (pending()?.interrupts.length) {
        <button
          data-testid="negative-incomplete-decisions"
          (click)="negative('decisions')"
        >
          Try incomplete decisions
        </button>
      }
      @for (name of negativeNames(); track name) {
        <button
          [attr.data-testid]="name"
          (click)="invoke(name, actions().negatives[name])"
        >
          {{ name }}
        </button>
      }
      <pre data-testid="status">{{ statusJson() }}</pre>
      <ng-content />
    </main>
  `,
})
export class CandidatePanel {
  readonly config = input.required<CandidateConfiguration>();
  readonly pending = input<PendingConversationRecovery>();
  readonly recovery = input.required<ConversationRecoveryState>();
  readonly data = input.required<Readonly<Record<string, unknown>>>();
  readonly actions = input.required<CandidatePanelActions>();
  readonly prompt = signal<string | undefined>(undefined);
  readonly history = signal<'strict' | 'preserve-diagnostics'>('strict');
  readonly localError = signal<string | null>(null);
  readonly lastRead = signal<Omit<
    CandidateRecoveryEnvelope,
    'snapshot'
  > | null>(null);
  readonly lastAction = signal<string | null>(null);
  readonly lastSubmission = signal<
    ResumeConversationRecoveryOptions | undefined
  >(undefined);
  readonly rerenders = signal(0);
  readonly draft = signal<
    Readonly<{ batchId: string; form: CandidateRecoveryForm }> | undefined
  >(undefined);
  readonly negativeNames = computed(() =>
    Object.keys(this.actions().negatives),
  );
  readonly pendingJson = computed(() => JSON.stringify(this.pending() ?? null));
  readonly statusJson = computed(() => {
    this.rerenders();
    return JSON.stringify({
      facade: this.config().facade,
      threadId: this.config().threadId,
      recovery: this.recovery(),
      pending: this.pending() ?? null,
      ...this.data(),
      localError: this.localError(),
      lastRead: this.lastRead(),
      lastAction: this.lastAction(),
    });
  });
  private readonly guard = createCandidateReadGuard();
  private previous: PendingConversationRecovery | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.guard.invalidate());
  }

  /** Extracts native control text without casting the event target. */
  value(event: Event): string {
    const target = event.target;
    if (
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement
    )
      return target.value;
    throw new Error('Expected a visible editor control');
  }
  /** Displays JSON only through escaped interpolation. */
  json(value: unknown): string {
    return JSON.stringify(value);
  }
  /** Stable harmless render action. */
  readonly increment = (value: number) => value + 1;
  /** Uses the current visible prompt only after explicit Start. */
  readonly start = () =>
    this.actions().start(this.prompt() ?? this.config().prompt);
  /** Explicitly starts the configured ordinary next turn. */
  readonly next = () => this.actions().next(this.config().nextPrompt);
  /** Displays an actual command exception without manufacturing runtime state. */
  invoke(name: string, action: () => void): void {
    this.lastAction.set(name);
    this.localError.set(null);
    try {
      action();
    } catch (error: unknown) {
      this.localError.set(candidateError(error));
    }
  }
  /** Captures thread and local revision before the real authenticated read. */
  async read(): Promise<void> {
    const config = this.config();
    const revision = this.recovery().revision;
    const ticket = this.guard.begin(config.threadId, revision);
    this.previous = this.pending() ?? this.previous;
    this.lastAction.set('read');
    this.localError.set(null);
    try {
      const request = buildCandidateRecoveryRead(
        config,
        this.actions().configuration(),
      );
      const response = await fetch(request.url, request.init);
      if (!response.ok)
        throw new Error(`Recovery read failed: ${response.status}`);
      const raw: unknown = await response.json();
      if (
        !this.guard.isCurrent(
          ticket,
          this.config().threadId,
          this.recovery().revision,
        )
      )
        throw new Error('Superseded recovery read');
      const envelope = parseCandidateRecoveryEnvelope(raw, config.threadId, [
        'getWeather',
      ]);
      const { snapshot, ...metadata } = envelope;
      this.lastRead.set(metadata);
      if (snapshot) {
        this.actions().restore(snapshot, {
          expectedRevision: revision,
          structuredHistory: this.history(),
        });
        if (snapshot.pendingBrowserRecovery) this.actions().restored?.();
      }
    } catch (error: unknown) {
      this.localError.set(candidateError(error));
    }
  }
  /** Selects an explicit diagnostic restoration policy. */
  setHistory(value: string): void {
    this.history.set(value === 'preserve-diagnostics' ? value : 'strict');
  }
  /** Reads only choices owned by this exact local batch token. */
  private currentForm(): CandidateRecoveryForm {
    const draft = this.draft();
    const pending = this.pending();
    return draft && pending && draft.batchId === pending.id
      ? draft.form
      : { outcomes: [], decisions: [] };
  }
  /** Reads one current outcome for display. */
  outcome(id: string) {
    return this.currentForm().outcomes.find(
      (choice) => choice.toolCallId === id,
    );
  }
  /** Reads one current decision for display. */
  decision(id: string): string {
    return (
      this.currentForm().decisions.find((choice) => choice.interruptId === id)
        ?.decision ?? ''
    );
  }
  /** Assigns a visible edit to the current token, clearing all obsolete choices. */
  editOutcome(id: string, field: 'status' | 'json', value: string): void {
    const pending = this.pending();
    if (!pending) return;
    const form = this.currentForm();
    const current = this.outcome(id);
    this.draft.set({
      batchId: pending.id,
      form: {
        ...form,
        outcomes: [
          ...form.outcomes.filter((choice) => choice.toolCallId !== id),
          {
            toolCallId: id,
            status: current?.status ?? '',
            json: current?.json ?? '',
            [field]: value,
          },
        ],
      },
    });
  }
  /** Assigns a genuine protected decision to the current token. */
  editDecision(id: string, decision: string): void {
    const pending = this.pending();
    if (!pending) return;
    const form = this.currentForm();
    this.draft.set({
      batchId: pending.id,
      form: {
        ...form,
        decisions: [
          ...form.decisions.filter((choice) => choice.interruptId !== id),
          { interruptId: id, decision },
        ],
      },
    });
  }
  /** Atomically submits complete choices only for their original local token. */
  submit(): void {
    this.invoke('resumeConversationRecovery', () => {
      const pending = this.pending();
      const draft = this.draft();
      if (!pending || !draft || draft.batchId !== pending.id)
        throw new Error('Form belongs to an obsolete recovery batch');
      const options = buildCandidateRecoveryOptions(pending, draft.form);
      this.lastSubmission.set(options);
      this.actions().settle(options);
    });
  }
  /** Repeats the identical object actually passed to the SDK, without replacing its token or outcomes. */
  repeatSubmission(): void {
    this.invoke('negative-repeat-submit:resumeConversationRecovery', () => {
      const options = this.lastSubmission();
      if (!options) throw new Error('No actual previous submission available');
      this.actions().settle(options);
    });
  }
  /** Deliberately submits malformed sets or a genuine previous token to the actual SDK. */
  negative(kind: 'stale' | 'outcomes' | 'decisions'): void {
    this.invoke(`negative-${kind}`, () => {
      const pending = kind === 'stale' ? this.previous : this.pending();
      if (!pending) throw new Error('No genuine recovery token available');
      this.actions().settle({
        batchId: pending.id,
        outcomes:
          kind === 'outcomes'
            ? []
            : pending.toolCalls.map((call) => ({
                toolCallId: call.id,
                status: 'unavailable' as const,
              })),
        entries:
          kind === 'decisions'
            ? []
            : pending.interrupts.map((interrupt) => ({
                interruptId: interrupt.id,
                status: 'cancelled' as const,
              })),
      });
    });
  }
  /** Replaces the entire page conversation and invalidates every in-flight read. */
  newThread(): void {
    this.guard.invalidate();
    openCandidateThread(this.config());
  }
}

/** Records only actual exceptions routed by Angular, retaining explicit button action context. */
@Injectable()
export class CandidateFrameworkErrors implements ErrorHandler {
  readonly failure = signal<ReturnType<typeof candidateFrameworkError> | null>(
    null,
  );
  /** Angular supplies the actual effect/bootstrap exception; no synthetic rejection is created. */
  handleError(error: unknown): void {
    const failure = candidateFrameworkError(error);
    this.failure.set(failure);
    finishCandidateConfigAction(failure.epoch ?? undefined);
  }
}
