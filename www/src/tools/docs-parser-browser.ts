import { expect, type Page } from '@playwright/test';

const status = (page: Page) => page.getByTestId('parser-status');
const button = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true });
const start = (page: Page) => button(page, 'Start stream').click();
const reset = (page: Page) => button(page, 'Reset').click();
const choose = (page: Page, example: string) =>
  page.getByRole('combobox', { name: 'Stream example' }).selectOption(example);

interface ParserSnapshot {
  json: string;
  city: string;
  forecast: string;
  alerts: number;
  status: string;
}

interface ParserObservation {
  snapshots: ParserSnapshot[];
  observer: MutationObserver;
}

/** Retains real DOM render states so short chunks cannot fall between browser polls. */
async function observeParser(
  page: Page,
  action: () => Promise<void>,
): Promise<ParserSnapshot[]> {
  // Keep this browser program literal: tsx function-name helpers are not present in the page.
  await page.evaluate(`(() => {
    const snapshots = [];
    const text = (id) =>
      (document.querySelector('[data-testid="' + id + '"]')?.textContent ?? '').trim();
    const capture = () =>
      snapshots.push({
        json: text('parser-json'),
        city: text('parser-city'),
        forecast: text('parser-forecast'),
        status: text('parser-status'),
        alerts: document.querySelectorAll('[data-testid="parser-alert"]')
          .length,
      });
    const observer = new MutationObserver(capture);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
    capture();
    window.__parserObservation = { snapshots, observer };
  })()`);
  try {
    await action();
    return await page.evaluate(
      () =>
        (window as unknown as { __parserObservation: ParserObservation })
          .__parserObservation.snapshots,
    );
  } finally {
    await page.evaluate(() => {
      const observed = window as unknown as {
        __parserObservation?: ParserObservation;
      };
      observed.__parserObservation?.observer.disconnect();
      delete observed.__parserObservation;
    });
  }
}

/** Observes partial fields and array items whose required field values are complete. */
export async function verifyParserProgress(page: Page): Promise<void> {
  await choose(page, 'valid');
  const snapshots = await observeParser(page, async () => {
    await start(page);
    await expect(status(page)).toHaveText('Complete valid document');
  });
  const diagnostics = JSON.stringify(snapshots, null, 2);

  expect(
    snapshots.some(
      (snapshot) =>
        snapshot.json.endsWith('Port') && snapshot.city !== 'Portland',
    ),
    diagnostics,
  ).toBe(true);
  expect(
    snapshots.some(
      (snapshot) =>
        snapshot.json.endsWith('"Clouds') &&
        snapshot.forecast === 'Clouds' &&
        snapshot.status === 'Streaming preview',
    ),
    diagnostics,
  ).toBe(true);
  expect(
    snapshots.some(
      (snapshot) =>
        snapshot.json.endsWith('"severity":"lo') && snapshot.alerts === 0,
    ),
    diagnostics,
  ).toBe(true);
  expect(
    snapshots.some(
      (snapshot) =>
        snapshot.alerts === 1 &&
        snapshot.status === 'Streaming preview' &&
        snapshot.json.endsWith('"severity":"low"'),
    ),
    diagnostics,
  ).toBe(true);
  await expect(page.getByTestId('parser-city')).toHaveText('Portland');
  await expect(page.getByTestId('parser-forecast')).toHaveText(
    'Clouds clearing by noon.',
  );
  await expect(page.getByTestId('parser-alert')).toHaveCount(2);
  await expect(page.getByTestId('parser-alert').first()).toContainText(
    'Wet roads',
  );
}

/** Exercises failures and ownership before any public footage is replaced. */
export async function verifyParser(page: Page): Promise<void> {
  await expect(status(page)).toHaveText('Idle');
  await expect(page.getByTestId('parser-json')).toBeEmpty();
  await start(page);
  await expect(page.getByTestId('parser-city')).toHaveText('Portland');
  await choose(page, 'truncated');
  await expect(status(page)).toHaveText('Idle');
  await expect(page.getByTestId('parser-json')).toBeEmpty();
  await expect(page.getByTestId('parser-city')).not.toHaveText('Portland');
  await expect(page.getByTestId('parser-forecast')).toHaveText(
    'Waiting for forecast…',
  );
  await expect(page.getByTestId('parser-alert')).toHaveCount(0);
  await page.waitForTimeout(800);
  await expect(status(page)).toHaveText('Idle');
  await expect(page.getByTestId('parser-json')).toBeEmpty();
  await expect(page.getByTestId('parser-alert')).toHaveCount(0);
  await expect(page.getByTestId('parser-forecast')).toHaveText(
    'Waiting for forecast…',
  );
  await start(page);
  await expect(status(page)).toHaveText('Incomplete document');
  await reset(page);
  await verifyParserProgress(page);
  for (const example of [
    'malformed',
    'schema-invalid',
    'truncated',
    'missing-streaming-field',
    'wrong-type',
  ]) {
    await reset(page);
    await choose(page, example);
    const snapshots = await observeParser(page, async () => {
      await start(page);
      await expect(status(page)).toHaveText(
        example === 'truncated'
          ? 'Incomplete document'
          : 'Invalid JSON or schema',
      );
    });
    if (example === 'malformed') {
      expect(
        snapshots.some(
          (snapshot) =>
            snapshot.city === 'Portland' &&
            snapshot.json.endsWith(']}') &&
            snapshot.status === 'Streaming preview',
        ),
        JSON.stringify(snapshots, null, 2),
      ).toBe(true);
      expect(
        snapshots.some(
          (snapshot) => snapshot.status === 'Complete valid document',
        ),
        JSON.stringify(snapshots, null, 2),
      ).toBe(false);
    }
    await expect(status(page)).not.toHaveText('Complete valid document');
    if (example !== 'truncated') {
      await expect(page.getByTestId('parser-city')).not.toHaveText('Portland');
      await expect(page.getByTestId('parser-alert')).toHaveCount(0);
    }
  }
  await reset(page);
  await choose(page, 'valid');
  await start(page);
  await expect(page.getByTestId('parser-city')).toHaveText('Portland');
  await button(page, 'Stop').click();
  await expect(status(page)).toHaveText('Stopped');
  const stopped = await page.getByTestId('parser-json').textContent();
  await page.waitForTimeout(800);
  await expect(page.getByTestId('parser-json')).toHaveText(stopped ?? '');
  await reset(page);
  await expect(status(page)).toHaveText('Idle');
  await expect(page.getByTestId('parser-json')).toBeEmpty();
  await start(page);
  await expect(page.getByTestId('parser-city')).toHaveText('Portland');
  await start(page);
  await expect(page.getByTestId('parser-city')).not.toHaveText('Portland');
  await expect(status(page)).toHaveText('Complete valid document');
  await start(page);
  await expect(page.getByTestId('parser-city')).toHaveText('Portland');
  await reset(page);
  await page.waitForTimeout(800);
  await expect(status(page)).toHaveText('Idle');
  await expect(page.getByTestId('parser-json')).toBeEmpty();
  await verifyParserProgress(page);
  await start(page);
  await expect(status(page)).toHaveText('Streaming preview');
  await page.evaluate(() =>
    (
      window as unknown as { __unmountParserDemo(): void }
    ).__unmountParserDemo(),
  );
  await page.waitForTimeout(800);
  await expect(page.getByTestId('parser-demo')).toHaveCount(0);
}

/** Records explicit start, cancellation, reset and successful recovery. */
export async function demonstrateParser(
  page: Page,
  phase: (text: string) => void = () => undefined,
): Promise<void> {
  phase(
    'Start the finite local JSON stream. No weather API or model is called.',
  );
  await choose(page, 'valid');
  await start(page);
  await expect(page.getByTestId('parser-city')).toHaveText('Portland');
  phase(
    'The city waits for its closing quote; the streaming forecast grows earlier.',
  );
  await expect(page.getByTestId('parser-forecast')).toContainText('Clouds');
  await page.waitForTimeout(150);
  phase(
    'Stop cancels the owned stream. A partial preview is not a valid document.',
  );
  await button(page, 'Stop').click();
  await page.waitForTimeout(1200);
  phase('Reset clears the stopped stream and preview.');
  await reset(page);
  await page.waitForTimeout(1000);
  phase('Start a new stream explicitly to recover.');
  await start(page);
  await expect
    .poll(() => page.getByTestId('parser-alert').count())
    .toBeGreaterThanOrEqual(1);
  phase('An alert appears once its required field values are complete.');
  await expect(status(page)).toHaveText('Complete valid document');
  phase(
    'Source EOF, parser completion and final validation establish a complete valid document.',
  );
}
