import { useEffect, useRef, useState } from 'react';
import { useJsonParser } from '@hashbrownai/react';
import {
  parserDemoState,
  parserExamples,
  type ParserSourceState,
  startLocalJsonStream,
  weatherSchema,
} from '../../runtime/json-parser-demo';

/** Previews a finite local JSON source with the real React parser. */
export function JsonParserDemo() {
  const [example, setExample] = useState<keyof typeof parserExamples>('valid');
  const [json, setJson] = useState('');
  const [source, setSource] = useState<ParserSourceState>('idle');
  const cancel = useRef<(() => void) | undefined>(undefined);
  const parser = useJsonParser(json, weatherSchema);
  const state = parserDemoState({
    source,
    json,
    error: parser.error,
    isComplete: parser.parserState.complete,
  });
  const preview = state.showPreview ? parser.value : undefined;

  useEffect(() => () => cancel.current?.(), []);

  function reset() {
    cancel.current?.();
    setJson('');
    setSource('idle');
  }

  function start() {
    reset();
    setSource('streaming');
    cancel.current = startLocalJsonStream(
      parserExamples[example],
      (chunk) => setJson((previous) => previous + chunk),
      () => setSource('ended'),
    );
  }

  return (
    <main data-testid="parser-demo">
      <h1>React streaming JSON parser</h1>
      <p>A finite local JSON stream. No weather service or model is called.</p>
      <label>
        Stream example{' '}
        <select
          value={example}
          onChange={(event) => {
            reset();
            setExample(event.target.value as keyof typeof parserExamples);
          }}
        >
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
        <button type="button" onClick={start}>
          Start stream
        </button>
        <button
          type="button"
          disabled={!state.busy}
          onClick={() => {
            cancel.current?.();
            setSource('stopped');
          }}
        >
          Stop
        </button>
        <button type="button" onClick={reset}>
          Reset
        </button>
      </nav>
      <p role="status" data-testid="parser-status">
        {state.status}
      </p>
      <div className="parser-panels">
        <section aria-label="Accumulated JSON">
          <h2>Accumulated JSON</h2>
          <pre data-testid="parser-json">{json}</pre>
        </section>
        <section
          aria-label="Weather preview"
          data-testid="parser-preview"
          aria-busy={state.busy}
        >
          <h2>Weather preview</h2>
          <h3 data-testid="parser-city">
            {preview?.city || 'Waiting for the complete city…'}
          </h3>
          <p data-testid="parser-forecast">
            {preview?.forecast || 'Waiting for forecast…'}
          </p>
          <ul data-testid="parser-alerts">
            {(preview?.alerts ?? []).map((alert, index) => (
              <li key={index} data-testid="parser-alert">
                {alert.title} ({alert.severity})
              </li>
            ))}
          </ul>
        </section>
      </div>
      <p>
        Partial values are a preview. Only an ended, complete, validated
        document succeeds.
      </p>
    </main>
  );
}
