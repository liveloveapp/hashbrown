---
title: 'Streaming JSON Parser in Angular: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Build a weather preview from a finite JSON stream with injectJsonParser, Skillet schemas, cancellation, and final document validation.'
---

# Build a streaming weather preview

Let's display a weather summary while its JSON arrives. The city waits for a complete string, the forecast grows a few words at a time, and alerts appear as their required field values resolve.

<hb-docs-demo demo="json-parser-angular">
</hb-docs-demo>

This recording runs the checked Angular component below. A finite local timer supplies the JSON chunks; no weather service and no live model is called. The parser and schema resolution are real.

<img src="/video/docs/json-parser-angular-result.png" alt="A completed Portland weather preview beside its accumulated JSON in Angular" width="1040" height="522" loading="lazy" />

## Before we start

Use the Angular project from the [Quickstart](/docs/angular/start/quick) with `@hashbrownai/angular` and `@hashbrownai/core` installed. This task runs entirely in the browser. It needs no endpoint, provider, or API key.

Keep `runtime/json-parser-demo.ts` beside the `react` and `angular` example directories. If you copy the files into your app, update the shared file import to match your layout. The two complete files are below.

Copy `json-parser-demo.ts` into `src/app/`. In the Quickstart's `src/main.ts`, replace the `App` import with:

```ts
import { JsonParserDemo as App } from './app/json-parser-demo';
```

Keep `bootstrapApplication(App, appConfig)`. In `src/index.html`, replace `<app-root></app-root>` with `<app-json-parser-demo></app-json-parser-demo>` so the host matches the component's selector. This parser does not require `provideHashbrown`; the Quickstart's existing providers can stay while you try it. Start the frontend with its existing dev command.

The component starts idle; select **Start stream** when you are ready. The recording adds presentation styles around the checked component; no stylesheet is required to use the parser.

## Watch the fields arrive

With **Valid weather** selected, start the stream and watch the accumulated JSON beside the preview.

- `city` uses `s.string()`. It waits for the closing quote before Portland appears.
- `forecast` uses `s.streaming.string()`. It first shows Clouds, then grows to Clouds clearing by noon.
- `alerts` uses `s.streaming.array()` around an ordinary `s.object()`. While the severity string is `"lo`, Wet roads stays hidden. Once it becomes `"low"`, the alert appears because its required field values have resolved—even before its closing brace arrives. A resolved alert is still a preview; it does not prove the JSON document is complete.

These choices describe which partial values your application is prepared to display. A streaming field can be useful before the document is finished; it does not establish that the document will finish successfully. See [Skillet](/docs/angular/concept/schema) for the schema language.

## Connect the accumulated JSON

`injectJsonParser` receives the full string so far. Keep appending each chunk to an Angular signal. The parser reuses its session for a growing prefix and starts a new session when the string is replaced.

```ts
private readonly parser = injectJsonParser(this.json, weatherSchema);
protected readonly state = computed(() => parserDemoState({
  source: this.source(), json: this.json(), error: this.parser.error(),
  isComplete: this.parser.parserState().complete,
}));
protected readonly preview = computed(() =>
  this.state().showPreview ? this.parser.value() : undefined,
);
```

`value` is the latest resolved preview. `error` reports JSON or schema errors, but a streaming array can withhold an invalid member without reporting an error. Final validation must still check the original document. `parserState.complete` reports whether the parser has completed its JSON root. Check it together with `error`, then validate the full document when the source ends.

The parser can retain its last resolved value after an error. Gate the preview with `state.showPreview` so an invalid result cannot leave an earlier successful-looking card on screen.

## Finish, stop, and start again

The local source owns its timer and returns a cancellation function. **Stop** cancels pending chunks and keeps the current partial preview labelled Stopped. **Reset** cancels the source and clears the JSON, preview, and error. Changing **Stream example** also resets the previous source. Starting again replaces any active source. Unmounting cancels it through `DestroyRef.onDestroy`.

**Complete valid document** requires all three checks: the source has ended, the parser reports `complete` without a parser error, and `weatherSchema.validate(JSON.parse(json))` succeeds on the accumulated document. Parsing the original JSON again at this boundary catches missing required fields that a streaming preview may fill with defaults.

Try the other presets, then return to **Valid weather** and start again:

| Stream example          | Expected result                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Malformed JSON          | A valid-looking preview is followed by trailing garbage. The error hides the preview.                              |
| Invalid schema          | An alert has an unsupported severity. The streaming array withholds it; final schema validation hides the preview. |
| Truncated stream        | The source ends inside the forecast string. The partial value remains labelled Incomplete document.                |
| Missing streaming field | Complete JSON omits the required forecast. Final schema validation hides the preview.                              |
| Wrong field type        | Complete JSON supplies a number for the forecast. The schema rejects it.                                           |

A stopped or truncated stream can still have useful partial values. Decide what your application should display, but keep the outcome visible and require a completed valid document before treating the result as final.

## Choose a parser API

Use [`injectJsonParser`](/api/angular/injectJsonParser) when your component already owns the accumulated string. Without a schema, it returns the parser's best resolved value; the typed field timing in this task comes from the Skillet schema.

Use [`injectImperativeJsonParser`](/api/angular/injectImperativeJsonParser) when your source already delivers chunk events and you want to call `parseChunk(chunk)` directly. Call `reset()` before a replacement document. Keep stream ownership in your component: cancel the old source on replacement, Stop, and unmount; reject callbacks from cancelled readers. For a `ReadableStream`, cancel the reader to settle a pending read, handle read failures, and release its lock in `finally`. Releasing a lock alone does not cancel the source. Register the reader cancellation with `DestroyRef.onDestroy` so navigation also stops the source.

## Complete source

The shared file defines the schema, deterministic chunks, lifecycle classification, and cancellable source. The component owns the accumulated text and feeds it to the framework parser.

<hb-expander title="Complete runtime/json-parser-demo.ts">
<hb-code-example header="runtime/json-parser-demo.ts">

```ts
import { s } from '@hashbrownai/core';

/** The weather fields resolved by both framework examples. */
export const weatherSchema = s.object('Weather summary', {
  city: s.string('City name'),
  forecast: s.streaming.string('Forecast text'),
  alerts: s.streaming.array(
    'Weather alerts',
    s.object('Alert', {
      title: s.string('Alert title'),
      severity: s.enumeration('Severity', ['low', 'medium', 'high']),
    }),
  ),
});

/** The finite source lifecycle, independent of JSON parser completion. */
export type ParserSourceState = 'idle' | 'streaming' | 'ended' | 'stopped';

/** Deterministic inputs for inspecting partial values and recovery. */
export const parserExamples: Record<
  | 'valid'
  | 'malformed'
  | 'schema-invalid'
  | 'truncated'
  | 'missing-streaming-field'
  | 'wrong-type',
  readonly string[]
> = {
  valid: [
    '{"city":"Port',
    'land","forecast":"',
    'Clouds',
    ' clearing by noon.","alerts":[',
    '{"title":"Wet roads","severity":"lo',
    'w"',
    '},',
    '{"title":"Gusty wind","severity":"medium"',
    '}',
    ']}',
  ],
  malformed: ['{"city":"Portland","forecast":"Clouds","alerts":[]}', '!'],
  'schema-invalid': [
    '{"city":"Portland","forecast":"Clouds","alerts":[',
    '{"title":"Wind","severity":"extreme"}]}',
  ],
  truncated: ['{"city":"Portland","forecast":"Clouds', ' clearing'],
  'missing-streaming-field': ['{"city":"Portland","alerts":[]}'],
  'wrong-type': ['{"city":"Portland","forecast":12,"alerts":[]}'],
};

/** Classifies source ownership separately from parser completion. */
export function parserDemoState(input: {
  source: ParserSourceState;
  error: unknown;
  isComplete: boolean;
  json: string;
}): {
  status: string;
  busy: boolean;
  isComplete: boolean;
  showPreview: boolean;
} {
  let invalid = Boolean(input.error);
  if (input.source === 'ended' && input.isComplete && !invalid) {
    try {
      weatherSchema.validate(JSON.parse(input.json));
    } catch {
      invalid = true;
    }
  }
  const complete = input.source === 'ended' && input.isComplete && !invalid;
  const status = invalid
    ? 'Invalid JSON or schema'
    : input.source === 'idle'
      ? 'Idle'
      : input.source === 'stopped'
        ? 'Stopped'
        : input.source === 'streaming'
          ? 'Streaming preview'
          : complete
            ? 'Complete valid document'
            : 'Incomplete document';
  return {
    status,
    busy: input.source === 'streaming',
    isComplete: complete,
    showPreview: input.source !== 'idle' && !invalid,
  };
}

/** Starts a finite local source and returns an idempotent cancellation function. */
export function startLocalJsonStream(
  chunks: readonly string[],
  onChunk: (chunk: string) => void,
  onEnd: () => void,
): () => void {
  let index = 0;
  let cancelled = false;
  const tick = () => {
    if (cancelled) return;
    if (index < chunks.length) onChunk(chunks[index++]);
    if (cancelled) return;
    if (index === chunks.length) onEnd();
    else timer = setTimeout(tick, 350);
  };
  let timer = setTimeout(tick, 350);
  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}
```

</hb-code-example>
</hb-expander>

<hb-expander title="Complete angular/src/app/json-parser-demo.ts">
<hb-code-example header="angular/src/app/json-parser-demo.ts">

```ts
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
```

</hb-code-example>
</hb-expander>
