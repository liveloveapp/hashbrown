import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
} from '@angular/core';
import { structuredCompletionResource } from '@hashbrownai/angular';
import {
  acceptPrediction,
  getApplicableSuggestions,
  packingCatalog,
  type PackingItemId,
  type PredictionInput,
  predictionsSchema,
} from '../../../runtime/predictions';

/** Suggests trusted packing items after an explicit change of trip context. */
@Component({
  selector: 'app-predictive-suggestions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <h1>Suggest items for your packing list</h1>
      <nav aria-label="Trip context">
        <button type="button" (click)="suggest('city')">
          Suggest city items
        </button>
        <button type="button" (click)="suggest('hiking')">
          Suggest hiking items
        </button>
        <button
          type="button"
          [disabled]="!input() || cancelled()"
          (click)="cancel()"
        >
          Cancel
        </button>
      </nav>
      <p role="status">{{ status() }}</p>
      <h2>Suggested items</h2>
      <ul data-testid="suggestions">
        @for (
          item of suggestions() ?? [];
          track input()?.contextId + ':' + item.itemId
        ) {
          <li>
            <strong>{{ catalog[item.itemId] }}</strong
            >: {{ item.reason }}
            <button type="button" (click)="accept(item.itemId)">Accept</button>
            <button type="button" (click)="dismiss(item.itemId)">
              Dismiss
            </button>
          </li>
        }
      </ul>
      <h2>Packing list</h2>
      <ul data-testid="packing-list">
        @for (itemId of appliedItemIds(); track itemId) {
          <li>{{ catalog[itemId] }}</li>
        }
      </ul>
      <p>
        Accept and Dismiss change only local state. Choose a context to request
        fresh suggestions. Refreshing clears your packing list.
      </p>
    </main>
  `,
})
export class PredictiveSuggestions {
  protected readonly catalog = packingCatalog;
  protected readonly input = signal<PredictionInput | null>(null);
  protected readonly cancelled = signal(false);
  protected readonly appliedItemIds = signal<PackingItemId[]>([]);
  private readonly hiddenItemIds = signal<PackingItemId[]>([]);
  private readonly completion = structuredCompletionResource({
    input: this.input,
    schema: predictionsSchema,
    system:
      'Suggest packing items for the supplied city or hiking context. Echo contextId exactly. Choose only catalog IDs passport, charger, water, sunscreen. Return zero to four items not in currentItemIds, each with a plain reason of 1–140 characters. An empty suggestions array is valid.',
  });
  protected readonly busy = computed(
    () =>
      this.completion.isSending() ||
      this.completion.isReceiving() ||
      this.completion.isGenerating() ||
      this.completion.isLoading(),
  );
  protected readonly suggestions = computed(() =>
    getApplicableSuggestions(this.run()),
  );
  protected readonly status = computed(() => {
    if (this.cancelled())
      return 'Suggestions cancelled. Choose a context to try again.';
    if (this.completion.error())
      return 'Could not generate suggestions. Choose a context to try again.';
    if (this.busy())
      return 'Finding suggestions. Your packing list stays unchanged.';
    if (
      this.completion.lastRunFinishReason() &&
      this.completion.lastRunFinishReason() !== 'stop'
    )
      return 'Generation ended before a complete result. Choose a context to try again.';
    const suggestions = this.suggestions();
    if (suggestions)
      return suggestions.length
        ? 'Suggestions ready. Accept or dismiss each item.'
        : 'No new suggestions. Choose a context to generate again.';
    if (this.input())
      return 'Waiting for a complete valid result for this context. Choose a context to retry.';
    return 'Choose a trip context to request suggestions.';
  });

  protected suggest(context: PredictionInput['context']): void {
    // Setting the fresh context invalidates old output before the input effect runs.
    this.input.set({
      contextId: crypto.randomUUID(),
      context,
      currentItemIds: [...this.appliedItemIds()],
    });
    this.cancelled.set(false);
    this.hiddenItemIds.set([]);
    if (this.busy()) this.completion.stop();
  }

  protected cancel(): void {
    this.cancelled.set(true);
    this.input.set(null);
    if (this.busy()) this.completion.stop();
  }

  protected accept(itemId: PackingItemId): void {
    // Signals read the current context and list synchronously at the event boundary.
    const appliedItemIds = acceptPrediction(this.run(), itemId);
    if (appliedItemIds) this.appliedItemIds.set(appliedItemIds);
  }

  protected dismiss(itemId: PackingItemId): void {
    const fresh = getApplicableSuggestions(this.run());
    if (!fresh?.some((suggestion) => suggestion.itemId === itemId)) return;
    this.hiddenItemIds.update((itemIds) => [...itemIds, itemId]);
  }

  private run() {
    return {
      input: this.input(),
      cancelled: this.cancelled(),
      appliedItemIds: this.appliedItemIds(),
      hiddenItemIds: this.hiddenItemIds(),
      output: this.completion.error() ? null : this.completion.value(),
      isSending: this.completion.isSending(),
      isReceiving: this.completion.isReceiving(),
      isGenerating: this.completion.isGenerating(),
      isLoading: this.completion.isLoading(),
      error: this.completion.error(),
      finishReason: this.completion.lastRunFinishReason(),
    };
  }
}
