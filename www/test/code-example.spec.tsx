// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { CodeExample } from '../src/components/CodeExample';

test('a code example with a moment renders See it run and dispatches its moment', () => {
  cleanup();
  const received: unknown[] = [];
  const listener = (event: Event) =>
    received.push((event as CustomEvent).detail);
  document.addEventListener('hb-workbench:see-it-run', listener);
  const { getByText } = render(
    <CodeExample header="src/tools.ts" id="code-example-0" moment="tool-call">
      <pre>code</pre>
    </CodeExample>,
  );

  fireEvent.click(getByText('See it run'));

  document.removeEventListener('hb-workbench:see-it-run', listener);
  expect(received).toEqual([
    { moment: 'tool-call', snippet: 'code-example-0' },
  ]);
});

test('a code example without a moment has no See it run', () => {
  cleanup();

  const { queryByText } = render(
    <CodeExample header="src/tools.ts">
      <pre>code</pre>
    </CodeExample>,
  );

  expect(queryByText('See it run')).toBeNull();
  vi.restoreAllMocks();
});

test('See it run names its snippet file', () => {
  cleanup();

  const { getByRole } = render(
    <CodeExample header="src/tools.ts" id="code-example-0" moment="tool-call">
      <pre>code</pre>
    </CodeExample>,
  );

  expect(
    getByRole('button', { name: 'See src/tools.ts run in the workbench' }),
  ).toBeTruthy();
});
