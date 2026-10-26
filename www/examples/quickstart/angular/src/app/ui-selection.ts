import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from '@angular/core';
import { UiDecisionComponent, uiDecisionResource } from '@hashbrownai/angular';
import {
  type SelectionId,
  type SelectionItem,
  selectionItems,
  selectionOptions,
  type SelectionRequest,
} from '../../../runtime/selection';

/** Summarizes app-owned product rows and their quantities. */
@Component({
  selector: 'app-selection-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-label="Summary card">
      <h2>Shopping summary</h2>
      <p>{{ items().length }} products</p>
      <p>{{ total() }} total items</p>
    </section>
  `,
})
export class SummaryCard {
  /** Product data supplied by the application. */
  readonly items = input.required<readonly SelectionItem[]>();
  protected readonly total = computed(() =>
    this.items().reduce((total, item) => total + item.quantity, 0),
  );
}

/** Displays app-owned names and quantities as text. */
@Component({
  selector: 'app-selection-items',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-label="Item list">
      <h2>Shopping items</h2>
      <ul>
        @for (item of items(); track item.name) {
          <li>{{ item.quantity }} × {{ item.name }}</li>
        }
      </ul>
    </section>
  `,
})
export class ItemList {
  /** Product data supplied by the application. */
  readonly items = input.required<readonly SelectionItem[]>();
}

/** Chooses an app-owned view with an explicit, independent manual fallback. */
@Component({
  selector: 'app-ui-selection',
  imports: [UiDecisionComponent, SummaryCard, ItemList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <h1>Choose a view from a request</h1>
      <form (submit)="$event.preventDefault(); choose()">
        <label for="view-request">What would you like to see?</label>
        <input
          id="view-request"
          [value]="prompt()"
          (input)="prompt.set($any($event.target).value)"
        />
        <button type="submit" [disabled]="!prompt().trim()">
          Choose a view
        </button>
      </form>
      <nav aria-label="Manual views">
        <button type="button" (click)="chooseManually('summary')">
          Show summary
        </button>
        <button type="button" (click)="chooseManually('items')">
          Show items
        </button>
      </nav>
      <p role="status">{{ status() }}</p>
      @if (manual() === 'summary') {
        <app-selection-summary [items]="items" />
      } @else if (manual() === 'items') {
        <app-selection-items [items]="items" />
      } @else if (request() && !picked.isLoading() && !picked.error()) {
        <hb-ui-decision [resource]="picked" />
      }
    </main>
  `,
})
export class UiSelection {
  protected readonly prompt = signal('Show a quick overview.');
  protected readonly request = signal<SelectionRequest | null>(null);
  protected readonly manual = signal<SelectionId | null>(null);
  protected readonly items = selectionItems;
  private readonly decisionInput = computed(() => {
    const request = this.request();
    return request === null ? null : { ...request };
  });
  protected readonly picked = uiDecisionResource({
    input: this.decisionInput,
    // Changing system recreates the resource synchronously, hiding the previous
    // result before the input effect sends the next request (even for the same prompt).
    system: computed(
      () =>
        `Choose a shopping view. Request: ${this.request()?.requestId ?? 'idle'}`,
    ),
    candidates: [
      {
        ...selectionOptions[0],
        component: SummaryCard,
        inputs: { items: selectionItems },
      },
      {
        ...selectionOptions[1],
        component: ItemList,
        inputs: { items: selectionItems },
      },
    ],
    select: 'one',
    minConfidence: 0.7,
  });
  protected readonly status = computed(() => {
    if (this.manual())
      return 'Manual view selected. Submit another request to ask the model again.';
    if (!this.request()) return 'Describe a view, or choose one manually.';
    if (this.picked.error())
      return 'Could not choose a view. Try again or choose one manually.';
    if (this.picked.isLoading() || this.picked.decision.value() === null)
      return 'Choosing a view. You can choose one manually at any time.';
    if (this.picked.ids().length === 0)
      return 'No confident choice. Choose a view manually or try another request.';
    return 'View ready. The application supplies all product data.';
  });

  protected choose(): void {
    if (!this.prompt().trim()) return;
    this.picked.decision.stop();
    this.manual.set(null);
    this.request.set({
      requestId: crypto.randomUUID(),
      prompt: this.prompt().trim(),
    });
  }

  protected chooseManually(id: SelectionId): void {
    this.picked.decision.stop();
    this.request.set(null);
    this.manual.set(id);
  }
}
