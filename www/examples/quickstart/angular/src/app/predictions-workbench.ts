import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { structuredCompletionResource } from '@hashbrownai/angular';
import type { WorkbenchStore } from '../../../runtime/workbench';
import { getWorkbenchLesson } from '../../../runtime/workbench-lessons';
import { workbenchApplicationInput } from '../../../runtime/workbench-recipe-input';
import {
  canUseWorkbenchRecipe,
  wasWorkbenchPredictionAccepted,
  wasWorkbenchPredictionDismissed,
} from '../../../runtime/workbench-recipe-view';
import {
  isWorkbenchPredictions,
  type WorkbenchActionId,
  workbenchActionLabels,
  workbenchPredictionsSchema,
  workbenchPredictionsSystem,
} from '../../../runtime/workbench-recipes';
import { createWorkbenchTransport } from '../../../runtime/workbench-transport';
import type { WorkbenchNavigation } from '../../../runtime/workbench-view';
import { createRecipeWorkbenchSession } from './recipe-workbench-session';

type Request = {
  contextId: string;
  prompt: string;
  application: ReturnType<typeof workbenchApplicationInput>;
};
/** Owns an isolated completion resource for one explicit application context. */
@Component({
  selector: 'app-workbench-predictions-run',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkbenchPredictionsRun {
  readonly request = input.required<Request>();
  readonly store = input.required<WorkbenchStore>();
  private readonly resource = structuredCompletionResource({
    input: computed(() => this.request()),
    system: workbenchPredictionsSystem,
    schema: workbenchPredictionsSchema,
    debounce: 0,
    retries: 0,
    transport: {
      name: 'RecipePredictionsTransport',
      send: (request) =>
        createWorkbenchTransport(
          this.store(),
          undefined,
          getWorkbenchLesson(window.location.search).endpoint,
        ).send(request),
    },
  });
  constructor() {
    effect(() => {
      const store = this.store();
      const request = this.request();
      const snapshot = store.getSnapshot();
      if (
        snapshot.status !== 'loading' ||
        snapshot.frame?.messages
          .filter((message) => message.role === 'user')
          .at(-1)?.id !== request.contextId
      )
        return;
      if (this.resource.error()) {
        store.settle('error');
        return;
      }
      if (!this.resource.isLoading() && this.resource.lastRunFinishReason()) {
        const output = this.resource.value();
        if (
          this.resource.lastRunFinishReason() === 'stop' &&
          !this.resource.pendingInterrupts() &&
          isWorkbenchPredictions(output) &&
          output.contextId === request.contextId &&
          store.recordRecipe(
            { kind: 'predictions', ...output },
            request.contextId,
          )
        )
          store.settle('complete', 'stop');
        else store.settle('error', this.resource.lastRunFinishReason());
      }
    });
  }
}

/** Requests fresh predictions and keeps every captured suggestion behind explicit review. */
@Component({
  selector: 'app-predictions-workbench-conversation',
  imports: [WorkbenchPredictionsRun],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #shell></div>
    <div #live>
      @if (active() && session.snapshot().status === 'loading') {
        @for (request of requests(); track request.contextId) {
          <app-workbench-predictions-run
            [request]="request"
            [store]="session.store"
          />
        }
      }
      @for (
        message of session.snapshot().frame?.messages ?? [];
        track message.id
      ) {
        @if (message.role === 'user') {
          <p class="wb-user">{{ message.content }}</p>
        } @else if (message.recipe?.kind === 'predictions') {
          <article class="wb-summary" aria-label="Predictive suggestions">
            <span class="wb-muted"
              >Structured completion · current application context</span
            >
            @if (message.recipe.suggestions.length === 0) {
              <p role="status">No suggestions for this context.</p>
            }
            @for (
              suggestion of message.recipe.suggestions;
              track suggestion.actionId
            ) {
              <section>
                <h2>{{ labels[suggestion.actionId] }}</h2>
                <p>{{ suggestion.reason }}</p>
                <button
                  type="button"
                  class="wb-primary"
                  [disabled]="!allowed(message.id, suggestion.actionId)"
                  (click)="session.store.acceptPrediction(suggestion.actionId)"
                >
                  Accept {{ labels[suggestion.actionId] }}
                </button>
                <button
                  type="button"
                  [disabled]="!allowed(message.id, suggestion.actionId)"
                  (click)="session.store.dismissPrediction(suggestion.actionId)"
                >
                  Dismiss {{ labels[suggestion.actionId] }}
                </button>
                @if (dismissed(message.id, suggestion.actionId)) {
                  <p>Dismissed</p>
                }
                @if (
                  wasAccepted(
                    session.snapshot(),
                    message.id,
                    suggestion.actionId
                  )
                ) {
                  <p>Accepted</p>
                }
              </section>
            }
            @if (!canUse(session.snapshot(), message.id)) {
              <p class="wb-muted">
                Request fresh suggestions for the current application state.
              </p>
            }
          </article>
        }
      }
      @if (
        (session.snapshot().frame?.status ?? session.snapshot().status) ===
        'error'
      ) {
        <p role="alert">
          Suggestions failed or did not match this context. Send a message to
          try again.
        </p>
      }
      @if (
        (session.snapshot().frame?.status ?? session.snapshot().status) ===
        'cancelled'
      ) {
        <p role="status">Suggestions cancelled. Send a message to try again.</p>
      }
    </div>`,
})
export class PredictionsWorkbenchConversation implements AfterViewInit {
  readonly active = input.required<boolean>();
  readonly navigation = input.required<WorkbenchNavigation>();
  protected readonly session = createRecipeWorkbenchSession(
    'predictions',
    this.active,
    this.navigation,
    {
      send: (prompt) => this.send(prompt),
      stop: () => this.stop(),
      reset: () => this.stop(),
    },
  );
  protected readonly requests = signal<readonly Request[]>([]);
  protected readonly labels = workbenchActionLabels;
  protected readonly canUse = canUseWorkbenchRecipe;
  protected readonly wasAccepted = wasWorkbenchPredictionAccepted;
  private readonly shell = viewChild.required<ElementRef<HTMLElement>>('shell');
  private readonly live = viewChild.required<ElementRef<HTMLElement>>('live');
  protected dismissed(messageId: string, id: WorkbenchActionId): boolean {
    return wasWorkbenchPredictionDismissed(
      this.session.snapshot(),
      messageId,
      id,
    );
  }
  protected allowed(messageId: string, id: WorkbenchActionId): boolean {
    return (
      canUseWorkbenchRecipe(this.session.snapshot(), messageId) &&
      !this.dismissed(messageId, id) &&
      !this.session.snapshot().frame?.application?.acceptedActions?.includes(id)
    );
  }
  private send(prompt: string): void {
    const user = this.session.store.send(prompt);
    this.requests.set([
      {
        contextId: user.id,
        prompt,
        application: workbenchApplicationInput(
          this.session.store.getSnapshot().application,
        ),
      },
    ]);
  }
  private stop(): void {
    this.session.store.settle('cancelled');
    this.requests.set([]);
  }
  ngAfterViewInit(): void {
    this.session.mount(this.shell().nativeElement, this.live().nativeElement);
  }
}
