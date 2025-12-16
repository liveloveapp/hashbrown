import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { structuredCompletionResource } from '@hashbrownai/angular';
import { s, experimental_local } from '@hashbrownai/core';

const LocalSummarySchema = s.object('Support reply draft', {
  tone: s.streaming.string('Overall sentiment tone'),
  summary: s.streaming.string('One-sentence summary of the user message'),
  reply: s.streaming.string('Short, empathetic reply the agent can send back'),
});

@Component({
  selector: 'www-local-models-demo',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card">
      <header>
        <div>
          <p class="eyebrow">Local-first AI</p>
          <h3>Draft a support reply fully on-device</h3>
        </div>
        <button
          type="button"
          (click)="onGenerate()"
          [disabled]="summary.isLoading()"
        >
          {{ summary.isReceiving() ? 'Streaming…' : 'Generate' }}
        </button>
      </header>

      <label class="field">
        <span>Paste a customer message</span>
        <input
          type="text"
          [value]="topic()"
          (input)="onTopicInput($event)"
          (keyup.enter)="onGenerate()"
          placeholder="E.g., “The earbuds stopped pairing after the last update...”"
        />
      </label>

      <div class="status">
        <div>
          <span class="label">Availability</span>
          <span class="value">{{ availability() ?? 'checking…' }}</span>
        </div>
        <div>
          <span class="label">Download</span>
          <span class="value">
            @if (downloadProgress() !== null) {
              {{ downloadProgress() }}%
            } @else if (downloadRequired()) {
              required on first run
            } @else {
              ready
            }
          </span>
        </div>
        <div>
          <span class="label">Session</span>
          <span class="value">{{ sessionState() ?? 'idle' }}</span>
        </div>
      </div>

      <div class="result" aria-live="polite">
        @if (summary.isReceiving()) {
          <p class="muted">Streaming from local model…</p>
        }
        @if (summary.value()) {
          <p class="headline">Tone: {{ summary.value()?.tone }}</p>
          <p class="body">Summary: {{ summary.value()?.summary }}</p>
          <p class="body">Reply: {{ summary.value()?.reply }}</p>
        } @else if (summary.error()) {
          <p class="error">Error: {{ summary.error()?.message }}</p>
        } @else {
          <p class="muted">Press Generate to test the local Prompt API flow.</p>
        }
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      color: inherit;
    }

    .card {
      border: 1px solid rgba(0, 0, 0, 0.06);
      border-radius: 12px;
      padding: 16px;
      background: #ffffff;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.04);
      display: grid;
      gap: 12px;
    }

    header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
    }

    .eyebrow {
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 12px;
      margin: 0;
      color: #5c6b8a;
    }

    h3 {
      margin: 2px 0 0;
      font-size: 18px;
      font-weight: 700;
    }

    button {
      border: 1px solid #111827;
      background: #111827;
      color: #fff;
      border-radius: 8px;
      padding: 8px 14px;
      font-weight: 600;
      cursor: pointer;
      transition:
        transform 120ms ease,
        box-shadow 120ms ease;
    }

    button:disabled {
      opacity: 0.6;
      cursor: default;
    }

    button:not(:disabled):hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
    }

    .field {
      display: grid;
      gap: 6px;
    }

    .field span {
      font-size: 14px;
      font-weight: 600;
    }

    input {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid rgba(0, 0, 0, 0.12);
      border-radius: 8px;
      font-size: 14px;
    }

    .status {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 8px;
      padding: 10px;
      background: #f8fafc;
      border-radius: 10px;
    }

    .label {
      display: block;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #6b7280;
    }

    .value {
      font-weight: 700;
      color: #111827;
    }

    .result {
      padding: 12px;
      border: 1px dashed rgba(0, 0, 0, 0.08);
      border-radius: 10px;
      min-height: 96px;
      background: linear-gradient(180deg, #fbfbff 0%, #ffffff 80%);
    }

    .headline {
      font-weight: 700;
      margin: 0 0 4px 0;
    }

    .body {
      margin: 0;
      color: #1f2937;
    }

    .muted {
      margin: 0;
      color: #6b7280;
    }

    .error {
      color: #b91c1c;
      margin: 0;
    }
  `,
})
export class LocalModelsDemo {
  readonly topic = signal(
    'Hi, my earbuds stopped pairing after the latest firmware update. I reset them twice and charged overnight but the light keeps flashing red.',
  );
  private readonly refresh = signal(0);

  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  readonly availability = signal<string | null>(null);
  readonly downloadProgress = signal<number | null>(null);
  readonly downloadRequired = signal<boolean | null>(null);
  readonly sessionState = signal<'created' | 'destroyed' | 'error' | null>(
    null,
  );

  private readonly prompt = computed(
    () =>
      `You are a support assistant. Analyze the customer's message and return JSON matching the schema. Keep the reply concise and empathetic, avoid promises you cannot keep, and suggest one actionable next step. Customer message: "${this.topic()}". refresh:${this.refresh()}`,
  );

  readonly summary = structuredCompletionResource({
    model: this.isBrowser
      ? [
          experimental_local({
            events: {
              availability: (status: string | undefined) =>
                this.availability.set(status ?? null),
              downloadProgress: (percent: number | undefined) =>
                this.downloadProgress.set(
                  typeof percent === 'number' ? Math.round(percent) : null,
                ),
              downloadRequired: (required: unknown) =>
                this.downloadRequired.set(Boolean(required)),
              sessionState: (
                state: 'created' | 'destroyed' | 'error' | undefined,
              ) => this.sessionState.set(state ?? null),
            },
          }),
          'gpt-5-mini',
        ]
      : ['gpt-5-mini'],
    schema: LocalSummarySchema,
    system:
      'Return concise, upbeat copy. Keep the headline punchy and the payoff sentence under 140 characters.',
    input: this.prompt,
    debugName: 'local-models-demo',
  });

  constructor() {
    if (!this.isBrowser) {
      this.availability.set('server render (local APIs unavailable)');
    }

    effect(() => {
      const err = this.summary.error();
      if (err) {
        // eslint-disable-next-line no-console
        console.error('Local models demo error', err);
      }
    });

    effect(() => {
      const err = this.summary.sendingError();
      if (err && this.isBrowser) {
        this.availability.set('unsupported or blocked');
      }
    });

    effect(() => {
      const err = this.summary.generatingError();
      if (err && this.isBrowser) {
        this.availability.set('errored');
      }
    });
  }

  onGenerate() {
    this.refresh.update((n) => n + 1);
    this.summary.reload();
  }

  onTopicInput(event: Event) {
    const target = event.target as HTMLInputElement | null;
    const value = target?.value ?? '';
    this.topic.set(value);
  }
}
