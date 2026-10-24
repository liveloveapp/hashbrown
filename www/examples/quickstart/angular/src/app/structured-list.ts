import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
} from '@angular/core';
import { structuredChatResource } from '@hashbrownai/angular';
import {
  getApplicableShoppingList,
  type ShoppingList,
  shoppingListSchema,
} from '../../../runtime/shopping-list';

/** Generates a reviewable draft and applies a validated copy to local state. */
@Component({
  selector: 'app-structured-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <h1>Turn a request into a shopping list</h1>
      <label for="shopping-request">Shopping request</label>
      <textarea
        id="shopping-request"
        [value]="prompt()"
        (input)="prompt.set($any($event.target).value)"
      ></textarea>
      <nav aria-label="Draft actions">
        <button
          type="button"
          [disabled]="!prompt().trim() || busy()"
          (click)="generate()"
        >
          Generate draft
        </button>
        <button
          type="button"
          [disabled]="!busy() || request()?.cancelled"
          (click)="cancel()"
        >
          Cancel
        </button>
        <button type="button" [disabled]="!candidate()" (click)="apply()">
          Apply list
        </button>
      </nav>
      <p role="status">{{ status() }}</p>
      <p>
        List rules: 1–10 items, names of 1–80 characters, quantities from 1–20.
      </p>
      <h2>Draft list</h2>
      <ul data-testid="draft-list">
        @for (item of draft()?.items ?? []; track $index) {
          <li>{{ item.quantity }} × {{ item.name }}</li>
        }
      </ul>
      <h2>Applied list</h2>
      <ul data-testid="applied-list">
        @for (item of applied()?.items ?? []; track $index) {
          <li>{{ item.quantity }} × {{ item.name }}</li>
        }
      </ul>
      <p>
        The applied list is saved only in this component. Refreshing clears it.
      </p>
    </main>
  `,
})
export class StructuredList {
  protected readonly prompt = signal('Add 2 apples and 1 loaf of bread.');
  protected readonly request = signal<
    { id: string; cancelled: boolean } | undefined
  >(undefined);
  protected readonly applied = signal<ShoppingList | undefined>(undefined);
  private readonly chat = structuredChatResource({
    schema: shoppingListSchema,
    system:
      'Turn the request into a shopping list. Use 1–10 items, names of 1–80 characters, and integer quantities from 1–20.',
  });
  protected readonly busy = computed(
    () => this.chat.isSending() || this.chat.isLoading(),
  );
  protected readonly draft = computed(
    () => this.chat.lastAssistantMessage()?.content,
  );
  protected readonly candidate = computed(() =>
    getApplicableShoppingList(this.run()),
  );
  protected readonly status = computed(() => {
    if (this.request()?.cancelled)
      return 'Generation cancelled. Generate another draft to continue.';
    if (this.chat.error())
      return 'Could not generate a valid draft. Try generating again.';
    if (this.busy())
      return 'Generating draft. Complete items appear as they arrive.';
    if (
      this.chat.lastRunFinishReason() &&
      this.chat.lastRunFinishReason() !== 'stop'
    )
      return 'Generation ended before a complete draft. Generate another draft.';
    if (this.candidate())
      return 'Draft ready. Review the items, then apply the list.';
    if (this.request())
      return 'Draft does not meet the list rules. Generate another draft.';
    return 'Describe your list, then generate a draft.';
  });

  protected generate(): void {
    const next = { id: crypto.randomUUID(), cancelled: false };
    this.request.set(next);
    // This component generates independent lists, so each request replaces its history.
    this.chat.setMessages([
      { id: next.id, role: 'user', content: this.prompt() },
    ]);
  }

  protected cancel(): void {
    const request = this.request();
    if (!request) return;
    this.request.set({ ...request, cancelled: true });
    this.chat.stop();
  }

  protected apply(): void {
    // Revalidate at the event boundary, after any synchronous Generate or Cancel.
    const list = getApplicableShoppingList(this.run());
    if (list) this.applied.set(list);
  }

  private run() {
    return {
      requestId: this.request()?.id,
      cancelled: this.request()?.cancelled ?? false,
      messages: this.chat.error() ? [] : this.chat.value(),
      isSending: this.chat.isSending(),
      isReceiving: this.chat.isReceiving(),
      isGenerating: this.chat.isGenerating(),
      isLoading: this.chat.isLoading(),
      error: this.chat.error(),
      finishReason: this.chat.lastRunFinishReason(),
    };
  }
}
