import { NgTemplateOutlet } from '@angular/common';
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
  TemplateRef,
  viewChild,
} from '@angular/core';
import { UiDecisionComponent, uiDecisionResource } from '@hashbrownai/angular';
import {
  workbenchDecisionPlan,
  type WorkbenchStore,
} from '../../../runtime/workbench';
import { getWorkbenchLesson } from '../../../runtime/workbench-lessons';
import {
  workbenchApplicationInput,
  workbenchSelectionConfidence,
} from '../../../runtime/workbench-recipe-input';
import { canUseWorkbenchRecipe } from '../../../runtime/workbench-recipe-view';
import {
  workbenchSelectionMinConfidence,
  workbenchSelectionOptions,
  workbenchSelectionSystem,
  type WorkbenchViewId,
} from '../../../runtime/workbench-recipes';
import { createWorkbenchDecisionTransport } from '../../../runtime/workbench-decision-transport';
import type { WorkbenchNavigation } from '../../../runtime/workbench-view';
import { createRecipeWorkbenchSession } from './recipe-workbench-session';

/** Trusted summary candidate with application-owned plan inputs. */
@Component({
  selector: 'app-workbench-plan-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<article class="wb-summary" aria-label="Plan summary">
    <span class="wb-muted">Application-owned plan · summary</span>
    <h2>{{ title() }}</h2>
    <p>{{ steps().join(' → ') }}</p>
  </article>`,
})
export class PlanSummary {
  readonly title = input.required<string>();
  readonly steps = input.required<readonly string[]>();
}
/** Trusted ordered candidate with the same application-owned plan inputs. */
@Component({
  selector: 'app-workbench-plan-steps',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<article class="wb-summary" aria-label="Plan steps">
    <span class="wb-muted">Application-owned plan · ordered steps</span>
    <h2>{{ title() }}</h2>
    <ol>
      @for (step of steps(); track $index) {
        <li>{{ step }}</li>
      }
    </ol>
  </article>`,
})
export class PlanSteps {
  readonly title = input.required<string>();
  readonly steps = input.required<readonly string[]>();
}
const candidates = workbenchSelectionOptions.map((option) => ({
  ...option,
  component: option.id === 'summary' ? PlanSummary : PlanSteps,
  inputs: {
    title: workbenchDecisionPlan.title,
    steps: [...workbenchDecisionPlan.steps],
  },
}));
type Request = {
  requestId: string;
  prompt: string;
  application: ReturnType<typeof workbenchApplicationInput>;
};

/** Keeps the genuine candidate-selection resource alive for its live preview. */
@Component({
  selector: 'app-workbench-selection-run',
  imports: [UiDecisionComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-template #preview
    ><hb-ui-decision [resource]="resource"
  /></ng-template>`,
})
export class WorkbenchSelectionRun {
  readonly request = input.required<Request>();
  readonly store = input.required<WorkbenchStore>();
  readonly preview = viewChild.required<TemplateRef<unknown>>('preview');
  readonly registerStop = input.required<(stop: () => void) => void>();
  protected readonly resource = uiDecisionResource({
    input: computed(() => this.request()),
    system: workbenchSelectionSystem,
    candidates,
    select: 'one',
    minConfidence: workbenchSelectionMinConfidence,
    optionOrder: 'declared',
    debounce: 0,
    transport: (request, signal) =>
      createWorkbenchDecisionTransport(
        this.store(),
        this.request().requestId,
        undefined,
        getWorkbenchLesson(window.location.search).endpoint,
      )(request, signal),
  });
  constructor() {
    effect(() => {
      this.registerStop()(this.resource.decision.stop);
    });
    inject(DestroyRef).onDestroy(() =>
      this.registerStop()(() => {
        /* No active request. */
      }),
    );
    effect(() => {
      const store = this.store();
      const request = this.request();
      const snapshot = store.getSnapshot();
      if (
        snapshot.status !== 'loading' ||
        snapshot.frame?.messages
          .filter((message) => message.role === 'user')
          .at(-1)?.id !== request.requestId
      )
        return;
      if (this.resource.error()) {
        store.settle('error');
        return;
      }
      const value = this.resource.decision.value();
      const meta = this.resource.decision.meta();
      if (!this.resource.isLoading() && value && meta) {
        const confidence = workbenchSelectionConfidence(meta);
        if (confidence === null) {
          store.settle('error');
          return;
        }
        const ids = this.resource.ids();
        const selected = ids.filter(
          (id): id is WorkbenchViewId => id === 'summary' || id === 'steps',
        );
        if (
          ids.length !== selected.length ||
          !store.recordRecipe(
            { kind: 'selection', selected, confidence },
            request.requestId,
          )
        )
          store.settle('error');
        else store.settle('complete', 'stop');
      }
    });
  }
}

/** Owns explicit model preview, manual fallback and immutable candidate history. */
@Component({
  selector: 'app-selection-workbench-conversation',
  imports: [PlanSummary, PlanSteps, WorkbenchSelectionRun, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #shell></div>
    <div #live>
      <app-workbench-plan-summary [title]="plan.title" [steps]="plan.steps" />
      @for (
        message of session.snapshot().frame?.messages ?? [];
        track message.id
      ) {
        @if (message.role === 'user') {
          <p class="wb-user">{{ message.content }}</p>
        } @else if (message.recipe?.kind === 'selection') {
          <article class="wb-summary" aria-label="UI selection result">
            <span class="wb-muted">UI decision · trusted candidates</span>
            @for (id of message.recipe.selected; track id) {
              @if (!sdkPreview(message.id)) {
                @if (id === 'summary') {
                  <app-workbench-plan-summary
                    [title]="plan.title"
                    [steps]="plan.steps"
                  />
                } @else {
                  <app-workbench-plan-steps
                    [title]="plan.title"
                    [steps]="plan.steps"
                  />
                }
              }
            }
            @if (sdkPreview(message.id)) {
              <div aria-label="Selected view preview">
                <ng-container
                  [ngTemplateOutlet]="runPreview()?.preview() ?? null"
                />
              </div>
            }
            <p>Confidence: {{ percent(message.recipe.confidence) }}%</p>
            <button
              type="button"
              class="wb-primary"
              [disabled]="!canUse(session.snapshot(), message.id)"
              (click)="session.store.applySelection()"
            >
              Use view
            </button>
            @if (message.recipe.selected.length === 0) {
              <p>Low confidence. Choose a view manually.</p>
            }
          </article>
        }
      }
      @if (
        (session.snapshot().frame?.status ?? session.snapshot().status) ===
        'error'
      ) {
        <p role="alert">
          View selection failed. Retry or choose a view manually.
        </p>
      }
      @if (
        (session.snapshot().frame?.status ?? session.snapshot().status) ===
        'cancelled'
      ) {
        <p role="status">
          Selection cancelled. Choose a view manually or send another request.
        </p>
      }
      <p class="wb-muted">You can always choose a view manually.</p>
      <div class="wb-actions">
        <button
          type="button"
          [disabled]="session.snapshot().cursor !== null"
          (click)="manual('summary')"
        >
          Show summary
        </button>
        <button
          type="button"
          [disabled]="session.snapshot().cursor !== null"
          (click)="manual('steps')"
        >
          Show steps
        </button>
      </div>
      @if (session.snapshot().frame?.application?.selectedView === 'steps') {
        <app-workbench-plan-steps [title]="plan.title" [steps]="plan.steps" />
      }
      @if (useSdk()) {
        @for (request of requests(); track request.requestId) {
          <app-workbench-selection-run
            [request]="request"
            [store]="session.store"
            [registerStop]="registerStop"
          />
        }
      }
    </div>`,
})
export class SelectionWorkbenchConversation implements AfterViewInit {
  readonly active = input.required<boolean>();
  readonly navigation = input.required<WorkbenchNavigation>();
  protected readonly session = createRecipeWorkbenchSession(
    'selection',
    this.active,
    this.navigation,
    {
      send: (prompt) => this.send(prompt),
      stop: () => this.stop(),
      reset: () => this.stop(),
    },
  );
  protected readonly requests = signal<readonly Request[]>([]);
  protected readonly plan = workbenchDecisionPlan;
  protected readonly canUse = canUseWorkbenchRecipe;
  protected readonly runPreview = viewChild(WorkbenchSelectionRun);
  private readonly shell = viewChild.required<ElementRef<HTMLElement>>('shell');
  private readonly live = viewChild.required<ElementRef<HTMLElement>>('live');
  private abort = () => {
    /* No active request. */
  };
  protected readonly registerStop = (stop: () => void) => {
    this.abort = stop;
  };
  protected readonly useSdk = computed(
    () =>
      this.active() &&
      this.requests().length > 0 &&
      (this.session.snapshot().status === 'loading' ||
        this.session.snapshot().status === 'complete'),
  );
  protected sdkPreview(id: string): boolean {
    return (
      this.useSdk() &&
      this.session.snapshot().cursor === null &&
      id === `recipe-${this.requests()[0]?.requestId}`
    );
  }
  protected percent(value: number): number {
    return Math.round(value * 100);
  }
  protected manual(id: WorkbenchViewId): void {
    if (this.session.store.getSnapshot().cursor !== null) return;
    this.abort();
    this.requests.set([]);
    this.session.store.manualSelection(id);
  }
  private send(prompt: string): void {
    this.abort();
    const user = this.session.store.send(prompt);
    this.requests.set([
      {
        requestId: user.id,
        prompt,
        application: workbenchApplicationInput(
          this.session.store.getSnapshot().application,
        ),
      },
    ]);
  }
  private stop(): void {
    this.abort();
    this.session.store.settle('cancelled');
    this.requests.set([]);
  }
  ngAfterViewInit(): void {
    this.session.mount(this.shell().nativeElement, this.live().nativeElement);
  }
}
