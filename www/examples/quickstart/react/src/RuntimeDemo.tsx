import { useState } from 'react';
import { useRuntime, useRuntimeFunction } from '@hashbrownai/react';
import {
  basketArgs,
  basketResult,
  readBasket,
  runtimeScripts,
} from '../../runtime/basket';

/** Runs visible JavaScript in QuickJS with one explicitly validated host capability. */
export function RuntimeDemo() {
  const [code, setCode] = useState(runtimeScripts.calculate);
  const [output, setOutput] = useState(
    'Run the script to calculate the basket total.',
  );
  const [running, setRunning] = useState(false);
  const read = useRuntimeFunction({
    name: 'readBasket',
    description: 'Read the current basket in USD. Prices are integer cents.',
    args: basketArgs,
    result: basketResult,
    handler: async (input) => readBasket(input),
    deps: [],
  });
  const runtime = useRuntime({ functions: [read], timeout: 1_000 });

  async function run() {
    setRunning(true);
    try {
      const response: unknown = await runtime.run(
        code,
        AbortSignal.timeout(2_000),
      );
      setOutput(JSON.stringify(response, null, 2));
    } catch (error) {
      setOutput(
        JSON.stringify(
          { error: error instanceof Error ? error.message : String(error) },
          null,
          2,
        ),
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <main>
      <h1>JavaScript runtime</h1>
      <p>Read three basket items, then calculate the total inside QuickJS.</p>
      <p>
        The only exposed host function is readBasket. It validates the currency
        before returning a snapshot.
      </p>
      <nav aria-label="Script presets">
        <button
          type="button"
          disabled={running}
          onClick={() => setCode(runtimeScripts.calculate)}
        >
          Calculate basket total
        </button>
        <button
          type="button"
          disabled={running}
          onClick={() => setCode(runtimeScripts.browser)}
        >
          Try browser access
        </button>
        <button
          type="button"
          disabled={running}
          onClick={() => setCode(runtimeScripts.invalid)}
        >
          Try invalid arguments
        </button>
      </nav>
      <label htmlFor="runtime-code">JavaScript code</label>
      <textarea
        id="runtime-code"
        rows={9}
        value={code}
        disabled={running}
        onChange={(event) => setCode(event.target.value)}
      />
      <button type="button" disabled={running} onClick={() => void run()}>
        Run in sandbox
      </button>
      {running && <p role="status">Running in QuickJS...</p>}
      <h2>Result or error</h2>
      <pre aria-live="polite" data-testid="runtime-output">
        {output}
      </pre>
      <p>
        Each run starts with a fresh context. Choose another script and run
        again after an error.
      </p>
    </main>
  );
}
