import { expect, test } from '@playwright/test';
import { createAppDriver } from '../../harness/app-driver';
import { createEventGate } from '../../harness/event-gate';
import { withDotnetFixture } from '../harness/http-fixture';
import { withTruncatedEndpoint } from '../harness/truncated-endpoint';

test('rejects real .NET SSE cut off before its terminal event', async ({
  page,
}, testInfo) => {
  const provider = testInfo.project.metadata['provider'] as 'openai' | 'azure';
  await withDotnetFixture(provider, async (fixture) => {
    await withTruncatedEndpoint(`${fixture.url}/run`, async (runUrl) => {
      const driver = createAppDriver(page);
      await page.goto(
        `/?${new URLSearchParams({ scenario: 'plain', runUrl, retries: '0' })}`,
      );
      const truncated = page.waitForResponse(
        (response) =>
          response.url() === runUrl && response.request().method() === 'POST',
      );

      await driver.send('Hello fixture');

      expect(await (await truncated).finished()).toBeNull();
      await expect(driver.error()).not.toBeEmpty();
      await driver.expectIdle();
      expect(fixture.requests).toHaveLength(1);
    });
  });
});

test('Stop cancels the native provider connection without late completion', async ({
  page,
}, testInfo) => {
  const provider = testInfo.project.metadata['provider'] as 'openai' | 'azure';
  const gate = createEventGate();
  await withDotnetFixture(
    provider,
    async (fixture) => {
      fixture.mock.onMessage(
        'Cancel fixture',
        { content: 'abcdefghij' },
        { chunkSize: 2 },
      );
      const driver = createAppDriver(page);
      await page.goto(
        `/?${new URLSearchParams({ scenario: 'plain', runUrl: `${fixture.url}/run`, retries: '0' })}`,
      );
      try {
        await driver.send('Cancel fixture');
        await expect(driver.assistant()).toHaveText('abcd');

        await driver.stop();

        await driver.expectIdle();
        await expect.poll(fixture.upstreamAborted).toBe(true);
        gate.releaseThrough(0);
        await expect(driver.assistant()).not.toHaveText('abcdefghij');
        await expect(driver.error()).toBeEmpty();
        expect(fixture.requests).toHaveLength(1);
      } finally {
        gate.releaseThrough(0);
      }
    },
    '',
    { pauseAfter: 4, gate },
  );
});

test('reports native model failure without hanging or retrying', async ({
  page,
}, testInfo) => {
  const provider = testInfo.project.metadata['provider'] as 'openai' | 'azure';
  await withDotnetFixture(provider, async (fixture) => {
    fixture.mock.onMessage('Fail fixture', {
      error: { message: 'Fixture provider failure', type: 'fixture_error' },
      status: 503,
    });
    const driver = createAppDriver(page);
    await page.goto(
      `/?${new URLSearchParams({ scenario: 'plain', runUrl: `${fixture.url}/run`, retries: '0' })}`,
    );

    await driver.send('Fail fixture');

    await expect(driver.error()).not.toBeEmpty();
    await driver.expectIdle();
    expect(fixture.requests).toHaveLength(1);
  });
});

for (const scenario of ['structured', 'ui'] as const) {
  test(`renders partial ${scenario} output before native JSON completion`, async ({
    page,
  }, testInfo) => {
    const provider = testInfo.project.metadata['provider'] as
      'openai' | 'azure';
    const gate = createEventGate();
    const prefix =
      scenario === 'structured'
        ? '{"count":2,"answer":"Ready'
        : '{"ui":[{"status":{"props":{"title":"Ready';
    const suffix = scenario === 'structured' ? '"}' : '","count":2}}}]}';
    await withDotnetFixture(
      provider,
      async (fixture) => {
        fixture.mock.onMessage(
          'Partial output fixture',
          { content: prefix + suffix },
          { chunkSize: 1 },
        );
        const driver = createAppDriver(page);
        await page.goto(
          `/?${new URLSearchParams({ scenario, runUrl: `${fixture.url}/run`, retries: '0' })}`,
        );
        try {
          await driver.send('Partial output fixture');

          await expect(
            scenario === 'structured'
              ? driver.structuredAnswer()
              : driver.statusCard(),
          ).toHaveText('Ready');
          await driver.expectLoading();
          gate.releaseThrough(0);
          await driver.expectIdle();
          await expect(driver.error()).toBeEmpty();
        } finally {
          gate.releaseThrough(0);
        }
      },
      '',
      { pauseAfter: prefix.length, gate },
    );
  });
}

test('repeated browser calls execute freshly across conversational turns', async ({
  page,
}, testInfo) => {
  const provider = testInfo.project.metadata['provider'] as 'openai' | 'azure';
  await withDotnetFixture(provider, async (fixture) => {
    fixture.mock.onToolResult('first-weather', { content: 'First complete' });
    fixture.mock.onToolResult('second-weather', { content: 'Second complete' });
    fixture.mock.onMessage('First weather', {
      toolCalls: [
        {
          id: 'first-weather',
          name: 'getWeather',
          arguments: { city: 'Paris' },
        },
      ],
    });
    fixture.mock.onMessage('Second weather', {
      toolCalls: [
        {
          id: 'second-weather',
          name: 'getWeather',
          arguments: { city: 'Tokyo' },
        },
      ],
    });
    const driver = createAppDriver(page);
    await page.goto(
      `/?${new URLSearchParams({ scenario: 'tool', runUrl: `${fixture.url}/run`, retries: '0' })}`,
    );
    await driver.send('First weather');
    await expect(driver.assistant()).toHaveText('First complete');
    await driver.expectIdle();

    await driver.send('Second weather');

    await expect(driver.assistant()).toHaveText('Second complete');
    await expect(driver.toolCount()).toHaveText('2');
    expect(fixture.requests).toHaveLength(4);
  });
});

for (const stage of ['before', 'after'] as const) {
  test(`Stop during resumed ${stage}-effect checkpoint prevents late work`, async ({
    page,
  }, testInfo) => {
    const provider = testInfo.project.metadata['provider'] as
      'openai' | 'azure';
    await withDotnetFixture(
      provider,
      async (fixture) => {
        const driver = createAppDriver(page);
        await page.goto(
          `/?${new URLSearchParams({ scenario: 'plain', runUrl: `${fixture.url}/run`, retries: '0' })}`,
        );
        await driver.send('Hello fixture');
        await expect(page.getByTestId('interrupt-count')).toHaveText('2');
        await page.getByTestId('resume').click();
        await expect
          .poll(
            async () =>
              (await (await fetch(`${fixture.url}/__test/counters`)).json())
                .checkpointStage,
          )
          .toBe(stage);

        await driver.stop();

        await driver.expectIdle();
        await expect
          .poll(
            async () =>
              (await (await fetch(`${fixture.url}/__test/counters`)).json())
                .checkpointCancelled,
          )
          .toBe(true);
        await fetch(`${fixture.url}/__test/release-checkpoint`, {
          method: 'POST',
        });
        await expect(driver.assistant()).toBeEmpty();
        await expect(driver.error()).toBeEmpty();
        expect(fixture.requests).toHaveLength(0);
        expect(
          await (await fetch(`${fixture.url}/__test/counters`)).json(),
        ).toMatchObject({ protected: stage === 'before' ? 0 : 1 });
      },
      `confirm-${stage}`,
    );
  });
}
