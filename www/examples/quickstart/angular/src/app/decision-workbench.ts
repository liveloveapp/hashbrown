import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { decisionResource } from '@hashbrownai/angular';
import {
  createWorkbenchStore,
  isCurrentWorkbenchDecision,
  wasWorkbenchDecisionApplied,
  type WorkbenchApplication,
  workbenchDecisionPlan,
  workbenchDecisionSchema,
  workbenchDecisionSystem,
  type WorkbenchStore,
} from '../../../runtime/workbench';
import { createWorkbenchDecisionTransport } from '../../../runtime/workbench-decision-transport';
import { getWorkbenchLesson } from '../../../runtime/workbench-lessons';
import {
  mountWorkbench,
  type WorkbenchNavigation,
} from '../../../runtime/workbench-view';

type Request = {
  requestId: string;
  prompt: string;
  application: WorkbenchApplication;
};

/** A fresh resource per user request prevents reuse of prior decisions. */
@Component({
  selector: 'app-workbench-decision-run',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkbenchDecisionRun {
  readonly request = input.required<Request>();
  readonly store = input.required<WorkbenchStore>();
  private readonly resource = decisionResource({
    schema: workbenchDecisionSchema,
    system: workbenchDecisionSystem,
    input: computed(() => {
      const request = this.request();
      return {
        ...request,
        application: {
          ...request.application,
          plan: request.application.plan
            ? {
                title: request.application.plan.title,
                steps: [...request.application.plan.steps],
              }
            : null,
        },
      };
    }),
    debounce: 0,
    retries: 0,
    transport: (request, signal) =>
      createWorkbenchDecisionTransport(this.store(), this.request().requestId)(
        request,
        signal,
      ),
  });
  constructor() {
    effect(() => {
      const store = this.store();
      const snapshot = store.getSnapshot();
      if (!isCurrentWorkbenchDecision(snapshot, this.request().requestId))
        return;
      const response = snapshot.events.some(
        (event) => event.turn === snapshot.turn && event.kind === 'event',
      );
      const value = this.resource.value();
      const meta = this.resource.meta();
      if (this.resource.error()) store.settle('error');
      else if (!this.resource.isLoading() && value && meta && response) {
        store.recordDecision(
          {
            nextAction: value.nextAction,
            confidence: meta.nextAction.confidence,
          },
          this.request().requestId,
        );
        store.settle('complete', 'stop');
      }
    });
  }
}

/** Hosts the decision resource, inert captured history and explicit suggestion review. */
@Component({
  selector: 'app-decision-workbench-conversation',
  imports: [WorkbenchDecisionRun],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #shell></div>
    <div #live>
      <article class="wb-summary" aria-label="Application plan">
        <span class="wb-muted">Application-owned plan</span>
        <h2>{{ plan.title }}</h2>
        <ol>
          @for (step of plan.steps; track $index) {
            <li>{{ step }}</li>
          }
        </ol>
      </article>
      @if (active() && snapshot().status === 'loading') {
        @for (run of requests(); track run.requestId) {
          <app-workbench-decision-run [request]="run" [store]="store" />
        }
      }
      @for (
        message of snapshot().events.at(-1)?.messages ?? [];
        track message.id
      ) {
        @if (message.role === 'user') {
          <p class="wb-user">{{ message.content }}</p>
        } @else if (message.decision; as decision) {
          <article class="wb-summary" aria-label="Decision result">
            <span class="wb-muted">Typed decision · application component</span>
            <h2>{{ decision.nextAction }}</h2>
            <p>Confidence: {{ percent(decision.confidence) }}%</p>
            <button
              class="wb-primary"
              type="button"
              [disabled]="!allowed(message.id, decision.confidence)"
              (click)="store.applyDecision()"
            >
              {{
                wasApplied(snapshot(), message.id)
                  ? 'Suggestion used'
                  : 'Use suggestion'
              }}
            </button>
            <p class="wb-muted">
              {{
                decision.confidence < 0.75
                  ? 'Low confidence. Review the plan manually.'
                  : wasApplied(snapshot(), message.id)
                    ? 'Saved next action to application state.'
                    : 'Review this suggestion before using it.'
              }}
            </p>
          </article>
        }
      }
      @if (snapshot().status === 'cancelled') {
        <p role="status">
          Decision cancelled. Retry or review the plan manually.
        </p>
      }
      @if (snapshot().status === 'error') {
        <p role="alert">Decision failed. Retry or review the plan manually.</p>
      }
    </div>`,
})
export class DecisionWorkbenchConversation implements AfterViewInit {
  readonly active = input.required<boolean>();
  readonly navigation = input.required<WorkbenchNavigation>();
  protected readonly wasApplied = wasWorkbenchDecisionApplied;
  protected readonly plan = workbenchDecisionPlan;
  protected readonly store = createWorkbenchStore('decision');
  protected readonly snapshot = signal(this.store.getSnapshot());
  protected readonly requests = signal<readonly Request[]>([]);
  private readonly shell = viewChild.required<ElementRef<HTMLElement>>('shell');
  private readonly live = viewChild.required<ElementRef<HTMLElement>>('live');
  private readonly mounted = signal<ReturnType<typeof mountWorkbench> | null>(
    null,
  );
  private readonly destroyRef = inject(DestroyRef);
  constructor() {
    const unsubscribe = this.store.subscribe(() =>
      this.snapshot.set(this.store.getSnapshot()),
    );
    this.destroyRef.onDestroy(() => {
      this.stop();
      unsubscribe();
    });
    effect(() => {
      const mounted = this.mounted();
      if (!mounted) return;
      mounted.navigation(this.navigation());
      if (!this.active()) {
        this.stop();
        mounted.pause();
      }
    });
  }
  protected percent(confidence: number): number {
    return Math.round(confidence * 100);
  }
  protected allowed(id: string, confidence: number): boolean {
    const snapshot = this.snapshot();
    const request = this.requests()[0];
    return (
      snapshot.cursor === null &&
      snapshot.status === 'complete' &&
      confidence >= 0.75 &&
      id === `decision-${request?.requestId}` &&
      snapshot.application.revision === request?.application.revision
    );
  }
  private stop(): void {
    this.store.settle('cancelled');
  }
  ngAfterViewInit(): void {
    const mounted = mountWorkbench(this.shell().nativeElement, this.store, {
      framework: 'Angular',
      lesson: getWorkbenchLesson(window.location.search),
      send: (prompt) => {
        const message = this.store.send(prompt);
        this.requests.set([
          {
            requestId: message.id,
            prompt,
            application: this.store.getSnapshot().application,
          },
        ]);
      },
      stop: () => this.stop(),
      reset: () => this.stop(),
    });
    mounted.live.append(this.live().nativeElement);
    this.mounted.set(mounted);
    this.destroyRef.onDestroy(() => mounted.dispose());
  }
}
