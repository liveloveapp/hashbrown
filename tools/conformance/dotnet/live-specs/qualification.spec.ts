import { expect, type Page, test, type TestInfo } from '@playwright/test';
import { createAppDriver } from '../../harness/app-driver';
import { LIVE_BUDGET_MANIFEST } from '../harness/live-budget';
import { runLiveNativeApprovalScenario } from '../harness/live-native-approval-scenario';
import { withRoutedEndpoint } from '../harness/routed-endpoint';
import {
  type LiveBrowserFixture,
  waitForLiveNativeCompletion,
  withLiveBrowserFixture,
  withSafeLiveCase,
} from '../harness/live-browser-fixture';

type Group = (typeof LIVE_BUDGET_MANIFEST.groups)[number]['name'];

/** Runs assertions inside the pre-persistence failure guard and closes browser work on deadline. */
async function qualify(
  page: Page,
  info: TestInfo,
  group: Group,
  operation: (fixture: LiveBrowserFixture) => Promise<void>,
) {
  await withSafeLiveCase(
    async (signal) => {
      const close = () => void page.close().catch(() => undefined);
      signal.addEventListener('abort', close, { once: true });
      try {
        await withLiveBrowserFixture(
          info.project.name,
          group,
          signal,
          operation,
        );
      } finally {
        signal.removeEventListener('abort', close);
      }
    },
    (annotation) => info.annotations.push(annotation),
  );
}

/** Opens the proven published client with fixture-only authentication and zero retries. */
async function open(
  page: Page,
  fixture: LiveBrowserFixture,
  scenario = 'plain',
  recovery = false,
) {
  await page.goto(
    `/?${new URLSearchParams({
      scenario,
      runUrl: `${fixture.url}/run`,
      retries: '0',
      ...(recovery
        ? { recoveryUrl: fixture.url, fixturePrincipal: 'alice' }
        : {}),
    })}`,
  );
}

/** Checks real native wire records after completion without retaining native bodies or values. */
async function expectWire(
  page: Page,
  fixture: LiveBrowserFixture,
  calls: number,
) {
  const stats = await waitForLiveNativeCompletion(fixture, calls);

  expect(stats.calls).toBe(calls);
  expect(stats.httpCalls).toBe(calls);
  expect(stats.wire).toHaveLength(calls);
  for (const request of stats.wire) {
    expect(request.method).toBe('POST');
    expect(['/v1/responses', '/openai/v1/responses']).toContain(request.path);
    expect(request.status).toBe(200);
    expect(request.authentication).not.toBe('missing');
    expect(request.maxOutputTokens).toBeGreaterThan(0);
    expect(request.maxOutputTokens).toBeLessThanOrEqual(384);
    expect(request.store).toBe(false);
  }
  const driver = createAppDriver(page);
  await driver.expectIdle();
  await expect(driver.error()).toBeEmpty();
}

/** Reads fixed fixture effect counters without adding provider dispatch. */
async function effects(fixture: LiveBrowserFixture) {
  const response = await fetch(`${fixture.url}/__test/counters`, {
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error('LIVE_COUNTERS_FAILED');
  return (await response.json()) as {
    server: number;
    protected: number;
    protectedCode: string | null;
  };
}

test('streaming-plain', async ({ page }, info) => {
  await qualify(page, info, 'streaming-plain', async (fixture) => {
    const driver = createAppDriver(page);
    await open(page, fixture);

    await driver.send(
      'Reply with one short friendly sentence about a clear sky.',
    );

    await expect(driver.assistant()).not.toBeEmpty();
    await driver.expectLoading();
    await expect.poll(async () => (await fixture.stats()).stage).toBe('paused');
    await fixture.release();
    await driver.expectIdle();
    await expect(driver.error()).toBeEmpty();
    await expectWire(page, fixture, 1);
  });
});

test('structured-schema', async ({ page }, info) => {
  await qualify(page, info, 'structured-schema', async (fixture) => {
    const driver = createAppDriver(page);
    await open(page, fixture, 'structured');

    await driver.send(
      'Return the structured answer Ready and the integer count 2.',
    );

    await expect(driver.structuredAnswer()).toHaveText('Ready');
    await expect(driver.structuredCount()).toHaveText('2');
    await driver.expectIdle();
    await expect(driver.error()).toBeEmpty();
    await expectWire(page, fixture, 1);
  });
});

test('trusted-ui-action', async ({ page }, info) => {
  await qualify(page, info, 'trusted-ui-action', async (fixture) => {
    const driver = createAppDriver(page);
    await open(page, fixture, 'ui');

    await driver.send(
      'Render exactly one status component with title Ready and integer count 2.',
    );

    await expect(driver.statusCard()).toHaveText('Ready: 2');
    await driver.expectIdle();
    await expect(driver.error()).toBeEmpty();
    await page.getByTestId('status-action').click();
    await expect(page.getByTestId('status-action-count')).toHaveText('1');
    await expectWire(page, fixture, 1);
  });
});

test('browser-tool', async ({ page }, info) => {
  await qualify(page, info, 'browser-tool', async (fixture) => {
    const driver = createAppDriver(page);
    await open(page, fixture, 'tool');

    await driver.send(
      'Call getWeather exactly once for city Paris. After receiving its result, give one short sentence about the result.',
    );

    await expect(driver.toolCount()).toHaveText('1');
    await driver.expectIdle();
    await expect(driver.assistant()).not.toBeEmpty();
    await expect(driver.error()).toBeEmpty();
    expect(await effects(fixture)).toMatchObject({ server: 0, protected: 0 });
    await expectWire(page, fixture, 2);
  });
});

test('server-tool', async ({ page }, info) => {
  await qualify(page, info, 'server-tool', async (fixture) => {
    const driver = createAppDriver(page);
    await open(page, fixture);

    await driver.send(
      'Call lookupAirport exactly once for code PDX. After receiving its result, give one short sentence naming the airport.',
    );

    await driver.expectIdle();
    await expect(driver.assistant()).not.toBeEmpty();
    await expect(driver.toolCount()).toHaveText('0');
    await expect(driver.error()).toBeEmpty();
    expect(await effects(fixture)).toMatchObject({ server: 1, protected: 0 });
    await expectWire(page, fixture, 2);
  });
});

test('approval-resume-decline', async ({ page }, info) => {
  await qualify(page, info, 'approval-resume-decline', async (fixture) => {
    const driver = createAppDriver(page);
    const submitted: Array<Record<string, unknown>> = [];
    page.on('request', (request) => {
      if (request.url() === `${fixture.url}/run` && request.method() === 'POST')
        submitted.push(request.postDataJSON());
    });
    await open(page, fixture, 'plain', true);
    await driver.send(
      'After the approved action, reply with one short friendly sentence.',
    );
    await expect(page.getByTestId('interrupt-count')).toHaveText('2');
    const originalBatch = await page
      .getByTestId('interrupt-batch-id')
      .textContent();
    const original = submitted[0];
    expect((await fixture.stats()).calls).toBe(0);
    expect(await effects(fixture)).toMatchObject({ protected: 0 });

    await page.reload();
    await page.getByTestId('refresh-recovery').click();

    await expect(page.getByTestId('recovery-status')).toHaveText('Pending');
    await expect(page.getByTestId('interrupt-count')).toHaveText('2');
    await expect(page.getByTestId('interrupt-batch-id')).not.toHaveText(
      originalBatch ?? '',
    );
    expect((await fixture.stats()).calls).toBe(0);
    expect(await effects(fixture)).toMatchObject({ protected: 0 });
    await page.getByTestId('resume').click();
    await driver.expectIdle();
    await expect(driver.assistant()).not.toBeEmpty();
    await expect(driver.error()).toBeEmpty();
    expect(submitted).toHaveLength(2);
    expect(submitted[1]['messages']).toEqual(original['messages']);
    expect(submitted[1]['tools']).toEqual(original['tools']);
    expect(submitted[1]['forwardedProps']).toEqual(original['forwardedProps']);
    expect(submitted[1]['threadId']).toBe(original['threadId']);
    expect(submitted[1]['runId']).not.toBe(original['runId']);
    expect(await effects(fixture)).toMatchObject({
      protected: 1,
      protectedCode: 'PDX',
    });
    await expectWire(page, fixture, 1);

    await page.reload();
    await page.getByTestId('refresh-recovery').click();

    await expect(page.getByTestId('recovery-status')).toHaveText('Completed');
    await expect(page.getByTestId('interrupt-count')).toHaveText('0');
    expect(await effects(fixture)).toMatchObject({ protected: 1 });
    await expectWire(page, fixture, 1);
    await page.getByTestId('new-thread').click();
    await driver.send(
      'This separate action must be declined before any model call.',
    );
    await expect(page.getByTestId('interrupt-count')).toHaveText('2');
    await page.getByTestId('decline').click();
    await driver.expectIdle();
    await expect(page.getByTestId('interrupt-count')).toHaveText('0');
    expect(await effects(fixture)).toMatchObject({ protected: 1 });
    await expectWire(page, fixture, 1);
  });
});

test('cancellation-recovery', async ({ page }, info) => {
  await qualify(page, info, 'cancellation-recovery', async (fixture) => {
    const driver = createAppDriver(page);
    await open(page, fixture, 'plain', true);
    await driver.send(
      'Reply with one short friendly sentence about a quiet lake.',
    );
    await expect(driver.assistant()).not.toBeEmpty();
    await driver.expectLoading();
    await expect.poll(async () => (await fixture.stats()).stage).toBe('paused');

    await driver.stop();

    await driver.expectIdle();
    await expect
      .poll(async () => (await fixture.stats()).cancelledCalls)
      .toBe(1);
    const oldThread = await page.getByTestId('recovery-thread').textContent();
    await page.getByTestId('new-thread').click();
    await expect(page.getByTestId('recovery-thread')).not.toHaveText(
      oldThread ?? '',
    );
    await expect(page.getByTestId('recovery-thread')).not.toBeEmpty();
    await expect(driver.assistant()).toBeEmpty();
    const recoveryPrompt =
      'Reply with one short friendly sentence about a quiet forest.';
    await driver.send(recoveryPrompt);
    await expect(driver.userMessage()).toHaveText(recoveryPrompt);
    await expectWire(page, fixture, 2);
    await expect(driver.assistant()).not.toBeEmpty();
    await driver.expectIdle();
    await expect(driver.error()).toBeEmpty();
    expect(await effects(fixture)).toMatchObject({ server: 0, protected: 0 });
  });
});

test('mixed-native-tools', async ({ page }, info) => {
  await qualify(page, info, 'mixed-native-tools', async (fixture) => {
    await withRoutedEndpoint(fixture.url, async (endpoint) => {
      const driver = createAppDriver(page);
      await page.goto(
        `/?${new URLSearchParams({ scenario: 'tool', runUrl: endpoint.url, recoveryUrl: new URL(endpoint.url).origin, recoveryMode: 'native', fixturePrincipal: 'alice', retries: '0' })}`,
      );

      await driver.send(
        'In your first response, call BOTH getWeather for city Paris AND lookupAirport for code PDX together in the SAME response, exactly once each. Do not call them sequentially. After both results, give one short sentence about the weather and airport.',
      );
      await expect
        .poll(
          async () =>
            (await (await fetch(`${fixture.url}/__test/native-stage`)).json())
              .stage,
        )
        .toBe('before-pending-save');

      expect((await fixture.stats()).calls).toBe(1);
      expect(endpoint.requests).toHaveLength(1);
      await expect(driver.toolCount()).toHaveText('0');
      expect(await effects(fixture)).toMatchObject({
        server: 0,
        protected: 0,
        durableNative: 0,
      });
      const released = await fetch(`${fixture.url}/__test/release-native`, {
        method: 'POST',
        signal: AbortSignal.timeout(5_000),
      });
      expect(released.ok).toBe(true);
      await expect(driver.toolCount()).toHaveText('1');
      await driver.expectIdle();
      await expect(driver.assistant()).not.toBeEmpty();
      await expectWire(page, fixture, 2);
      expect(await fixture.stats()).toMatchObject({
        nativeCoEmission: true,
        nativeExactHistory: true,
      });
      expect(await effects(fixture)).toMatchObject({
        server: 1,
        protected: 0,
        durableNative: 1,
        nativeCode: 'PDX',
      });
      const persisted = await (
        await fetch(`${fixture.url}/__test/native-effects`, {
          signal: AbortSignal.timeout(5_000),
        })
      ).json();
      expect(persisted).toMatchObject({ count: 1, rows: [{ code: 'PDX' }] });
      expect(endpoint.requests).toHaveLength(2);
      expect(endpoint.responses).toHaveLength(2);
      const captured = endpoint.responses[0];
      expect(captured.truncated).toBe(false);
      const initial = captured.body;
      expect(initial).toMatch(/\r?\n\r?\n$/);
      const events = initial
        .split(/\r?\n\r?\n/)
        .filter((frame) => frame.trim())
        .map((frame) => {
          const data = frame
            .split(/\r?\n/)
            .filter((line) => line.startsWith('data:'));
          expect(data).toHaveLength(1);
          return JSON.parse(data[0].slice(5).trim()) as Record<string, unknown>;
        });
      expect(
        events
          .filter((event) => event['type'] === 'TOOL_CALL_START')
          .map((event) => event['toolCallName']),
      ).toEqual(['getWeather']);
      expect(
        events.filter((event) => event['type'] === 'RUN_FINISHED'),
      ).toHaveLength(1);
    });
  });
});

/** Actual scoped native rows are used only in memory inside the safe case guard. */
test('native-approval', async ({ page }, info) => {
  await qualify(page, info, 'native-approval', async (fixture) => {
    await withRoutedEndpoint(fixture.url, (endpoint) =>
      runLiveNativeApprovalScenario(page, fixture, endpoint),
    );
  });
});
