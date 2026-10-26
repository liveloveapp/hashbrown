import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { injectJsonParser } from '@hashbrownai/angular';
import {
  parserDemoState,
  parserExamples,
  type ParserSourceState,
  startLocalJsonStream,
  weatherSchema,
} from '../../../runtime/json-parser-demo';

/** Previews a finite local JSON source with the real Angular parser. */
@Component({
  selector: 'app-json-parser-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main data-testid="parser-demo">
      <h1>Angular streaming JSON parser</h1>
      <p>A finite local JSON stream. No weather service or model is called.</p>
      <label>
        Stream example
        <select [value]="example()" (change)="selectExample($event)">
          <option value="valid">Valid weather</option>
          <option value="malformed">Malformed JSON</option>
          <option value="schema-invalid">Invalid schema</option>
          <option value="truncated">Truncated stream</option>
          <option value="missing-streaming-field">
            Missing streaming field
          </option>
          <option value="wrong-type">Wrong field type</option>
        </select>
      </label>
      <nav aria-label="Stream actions">
        <button type="button" (click)="start()">Start stream</button>
        <button type="button" [disabled]="!state().busy" (click)="stop()">
          Stop
        </button>
        <button type="button" (click)="reset()">Reset</button>
      </nav>
      <p role="status" data-testid="parser-status">{{ state().status }}</p>
      <div class="parser-panels">
        <section aria-label="Accumulated JSON">
          <h2>Accumulated JSON</h2>
          <pre data-testid="parser-json">{{ json() }}</pre>
        </section>
        <section
          aria-label="Weather preview"
          data-testid="parser-preview"
          [attr.aria-busy]="state().busy"
        >
          <h2>Weather preview</h2>
          <h3 data-testid="parser-city">
            {{ preview()?.city || 'Waiting for the complete city…' }}
          </h3>
          <p data-testid="parser-forecast">
            {{ preview()?.forecast || 'Waiting for forecast…' }}
          </p>
          <ul data-testid="parser-alerts">
            @for (alert of preview()?.alerts ?? []; track $index) {
              <li data-testid="parser-alert">
                {{ alert.title }} ({{ alert.severity }})
              </li>
            }
          </ul>
        </section>
      </div>
      <p>
        Partial values are a preview. Only an ended, complete, validated
        document succeeds.
      </p>
    </main>
  `,
})
export class JsonParserDemo {
  protected readonly example = signal<keyof typeof parserExamples>('valid');
  protected readonly json = signal('');
  private readonly source = signal<ParserSourceState>('idle');
  private cancel: (() => void) | undefined;
  private readonly parser = injectJsonParser(this.json, weatherSchema);
  protected readonly state = computed(() =>
    parserDemoState({
      source: this.source(),
      json: this.json(),
      error: this.parser.error(),
      isComplete: this.parser.parserState().complete,
    }),
  );
  protected readonly preview = computed(() =>
    this.state().showPreview ? this.parser.value() : undefined,
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => this.cancel?.());
  }

  protected selectExample(event: Event): void {
    this.reset();
    this.example.set(
      (event.target as HTMLSelectElement).value as keyof typeof parserExamples,
    );
  }

  protected reset(): void {
    this.cancel?.();
    this.json.set('');
    this.source.set('idle');
  }

  protected start(): void {
    this.reset();
    this.source.set('streaming');
    this.cancel = startLocalJsonStream(
      parserExamples[this.example()],
      (chunk) => this.json.update((previous) => previous + chunk),
      () => this.source.set('ended'),
    );
  }

  protected stop(): void {
    this.cancel?.();
    this.source.set('stopped');
  }
}
