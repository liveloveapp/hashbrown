import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { experimental_chrome } from '@hashbrownai/core';
import { structuredChatResource } from '@hashbrownai/angular';
import {
  getNativeLanguageModel,
  getReadyTripBrief,
  prepareLocalModel,
  tripBriefSchema,
} from '../../../runtime/local-models';

const transport = experimental_chrome({
  outputLanguage: 'en',
  events: {
    downloadRequired: () => {
      throw new Error(
        'Model download required. Select Prepare model, then try again.',
      );
    },
  },
});

/** Extracts a complete trip brief with an explicitly prepared browser model. */
@Component({
  selector: 'app-local-models',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <h1>Extract a trip brief locally</h1>
      <label for="trip-request">Trip request</label>
      <textarea
        id="trip-request"
        [value]="prompt()"
        (input)="onInput($event)"
      ></textarea>
      <nav aria-label="Local model actions">
        <button type="button" [disabled]="busy()" (click)="prepare()">
          Prepare model
        </button>
        <button
          type="button"
          [disabled]="
            busy() || preparation().state !== 'ready' || !prompt().trim()
          "
          (click)="generate()"
        >
          Generate locally
        </button>
        <button type="button" [disabled]="!busy()" (click)="cancel()">
          Cancel
        </button>
      </nav>
      <p role="status">{{ status() }}</p>
      <h2>Trip brief</h2>
      <section
        aria-label="Trip brief"
        data-testid="trip-brief"
        [attr.aria-busy]="busy()"
      >
        @if (brief(); as brief) {
          <dl>
            <dt>Destination</dt>
            <dd>{{ brief.destination }}</dd>
            <dt>Days</dt>
            <dd>{{ brief.days }}</dd>
          </dl>
        }
      </section>
    </main>
  `,
})
export class LocalModels {
  protected readonly prompt = signal('Three days in Lisbon.');
  protected readonly preparation = signal<{
    state: 'idle' | 'preparing' | 'ready' | 'error';
    progress?: number;
    issue?: string;
  }>({ state: 'idle' });
  private readonly requestId = signal<string | undefined>(undefined);
  private readonly stopped = signal(false);
  private controller: AbortController | undefined;
  private readonly chat = structuredChatResource({
    schema: tripBriefSchema,
    system:
      'Extract the destination and trip length from the request. Return a destination of 1–80 characters and an integer number of days from 1 to 14.',
    transport,
    debugName: 'local-models',
  });
  private readonly generating = computed(
    () =>
      this.chat.isSending() ||
      this.chat.isReceiving() ||
      this.chat.isGenerating() ||
      this.chat.isLoading(),
  );
  protected readonly busy = computed(
    () => this.preparation().state === 'preparing' || this.generating(),
  );
  protected readonly brief = computed(() =>
    getReadyTripBrief({
      requestId: this.requestId(),
      cancelled: this.stopped() || this.preparation().state !== 'ready',
      messages: this.chat.error() ? [] : this.chat.value(),
      isSending: this.chat.isSending(),
      isReceiving: this.chat.isReceiving(),
      isGenerating: this.chat.isGenerating(),
      isLoading: this.chat.isLoading(),
      error: this.chat.error(),
      finishReason: this.chat.lastRunFinishReason(),
    }),
  );
  protected readonly status = computed(() => {
    if (this.stopped()) return 'Stopped. Prepare the model or generate again.';
    const preparation = this.preparation();
    if (preparation.state === 'preparing')
      return preparation.progress === undefined
        ? 'Preparing model…'
        : `Downloading model: ${preparation.progress}%`;
    if (preparation.state === 'error') return preparation.issue;
    if (this.generating()) return 'Generating locally…';
    if (this.requestId() && this.chat.error())
      return 'Generation failed. Select Prepare model, then generate again.';
    if (this.brief()) return 'Trip brief ready.';
    if (this.requestId())
      return 'No complete valid trip brief. Generate locally to try again.';
    return preparation.state === 'ready'
      ? 'Model ready. Generate locally.'
      : 'Prepare the model to begin.';
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.controller?.abort());
  }

  protected onInput(event: Event): void {
    this.prompt.set((event.currentTarget as HTMLTextAreaElement).value);
  }

  protected async prepare(): Promise<void> {
    if (this.busy() || this.controller) return;
    const next = new AbortController();
    this.controller = next;
    this.stopped.set(false);
    this.requestId.set(undefined);
    this.preparation.set({ state: 'preparing' });
    try {
      await prepareLocalModel({
        model: getNativeLanguageModel(),
        signal: next.signal,
        onProgress: (progress) => {
          if (!next.signal.aborted && this.controller === next)
            this.preparation.set({ state: 'preparing', progress });
        },
      });
      if (!next.signal.aborted && this.controller === next)
        this.preparation.set({ state: 'ready' });
    } catch (error: unknown) {
      if (!next.signal.aborted && this.controller === next)
        this.preparation.set({
          state: 'error',
          issue:
            error instanceof Error
              ? `${error.message} Check Chrome support and select Prepare model to try again.`
              : 'Preparation failed. Check Chrome support and select Prepare model to try again.',
        });
    } finally {
      if (this.controller === next) this.controller = undefined;
    }
  }

  protected generate(): void {
    if (
      this.busy() ||
      this.preparation().state !== 'ready' ||
      !this.prompt().trim()
    )
      return;
    const id = crypto.randomUUID();
    this.stopped.set(false);
    this.requestId.set(id);
    this.chat.setMessages([
      { id, role: 'user', content: this.prompt().trim() },
    ]);
  }

  protected cancel(): void {
    if (!this.busy()) return;
    this.stopped.set(true);
    if (this.controller) {
      this.controller.abort();
      this.controller = undefined;
      this.preparation.set({ state: 'idle' });
    }
    if (this.generating()) this.chat.stop();
  }
}
