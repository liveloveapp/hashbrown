import { expect, test } from '@playwright/test';
import { createAppDriver } from '../../harness/app-driver';
import { withDotnetFixture } from '../harness/http-fixture';
import { createEventGate } from '../../harness/event-gate';

test('renders partial text before the native model finishes', async ({
  page,
}, testInfo) => {
  const provider = testInfo.project.metadata['provider'] as 'openai' | 'azure';
  const gate = createEventGate();
  await withDotnetFixture(
    provider,
    async (fixture) => {
      fixture.mock.onMessage(
        'Streaming fixture',
        { content: 'abcdefghij' },
        { chunkSize: 2 },
      );
      const driver = createAppDriver(page);
      await page.goto(
        `/?${new URLSearchParams({ scenario: 'plain', runUrl: `${fixture.url}/run`, retries: '0' })}`,
      );

      try {
        await driver.send('Streaming fixture');

        await expect(driver.assistant()).toHaveText('abcd');
        await driver.expectLoading();
        gate.releaseThrough(0);
        await expect(driver.assistant()).toHaveText('abcdefghij');
        await driver.expectIdle();
      } finally {
        gate.releaseThrough(0);
      }
    },
    '',
    { pauseAfter: 4, gate },
  );
});

test('streams text through the real .NET provider', async ({
  page,
}, testInfo) => {
  const provider = testInfo.project.metadata['provider'] as 'openai' | 'azure';
  await withDotnetFixture(provider, async (fixture) => {
    const driver = createAppDriver(page);
    await page.goto(
      `/?${new URLSearchParams({ scenario: 'plain', runUrl: `${fixture.url}/run`, retries: '0' })}`,
    );

    await driver.send('Hello fixture');

    await expect(driver.assistant()).toHaveText('Hello from .NET');
    await driver.expectIdle();
    await expect(driver.error()).toBeEmpty();
    expect(fixture.requests).toHaveLength(1);
  });
});

for (const scenario of ['structured', 'ui'] as const) {
  test(`renders ${scenario} using the exact native output schema`, async ({
    page,
  }, testInfo) => {
    const provider = testInfo.project.metadata['provider'] as
      'openai' | 'azure';
    await withDotnetFixture(provider, async (fixture) => {
      const content =
        scenario === 'structured'
          ? { answer: 'Ready', count: 2 }
          : { ui: [{ status: { props: { title: 'Ready', count: 2 } } }] };
      fixture.mock.onMessage('Output fixture', { content });
      const inputs: Array<{
        forwardedProps?: { hashbrown?: { responseSchema?: object } };
      }> = [];
      page.on('request', (request) => {
        if (
          request.url() === `${fixture.url}/run` &&
          request.method() === 'POST'
        )
          inputs.push(request.postDataJSON());
      });
      const driver = createAppDriver(page);
      await page.goto(
        `/?${new URLSearchParams({ scenario, runUrl: `${fixture.url}/run`, retries: '0' })}`,
      );

      await driver.send('Output fixture');

      if (scenario === 'structured')
        await expect(driver.structuredAnswer()).toHaveText('Ready');
      else await expect(driver.statusCard()).toHaveText('Ready: 2');
      await driver.expectIdle();
      await expect(driver.error()).toBeEmpty();
      expect(fixture.requests[0].body.response_format).toMatchObject({
        json_schema: {
          schema: inputs[0].forwardedProps?.hashbrown?.responseSchema,
          strict: true,
        },
      });
    });
  });
}

test('executes a browser tool and resumes through the .NET agent', async ({
  page,
}, testInfo) => {
  const provider = testInfo.project.metadata['provider'] as 'openai' | 'azure';
  await withDotnetFixture(provider, async (fixture) => {
    fixture.mock.onToolResult('weather-1', { content: 'Sunny' });
    fixture.mock.onMessage('Weather fixture', {
      toolCalls: [
        { id: 'weather-1', name: 'getWeather', arguments: { city: 'Paris' } },
      ],
    });
    const driver = createAppDriver(page);
    await page.goto(
      `/?${new URLSearchParams({ scenario: 'tool', runUrl: `${fixture.url}/run`, retries: '0' })}`,
    );

    await driver.send('Weather fixture');

    await expect(driver.assistant()).toHaveText('Sunny');
    await expect(driver.toolCount()).toHaveText('1');
    await driver.expectIdle();
    expect(fixture.requests).toHaveLength(2);
  });
});

test('exposes native interrupts and resumes through the public API', async ({
  page,
}, testInfo) => {
  const provider = testInfo.project.metadata['provider'] as 'openai' | 'azure';
  await withDotnetFixture(
    provider,
    async (fixture) => {
      const driver = createAppDriver(page);
      await page.goto(
        `/?${new URLSearchParams({ scenario: 'plain', runUrl: `${fixture.url}/run`, retries: '0' })}`,
      );
      await driver.send('Hello fixture');
      await expect(page.getByTestId('interrupt-count')).toHaveText('2');
      expect(fixture.requests).toHaveLength(0);

      await page.getByTestId('resume').click();

      await expect(driver.assistant()).toHaveText('Hello from .NET');
      await driver.expectIdle();
      await expect(page.getByTestId('interrupt-count')).toHaveText('0');
      expect(fixture.requests).toHaveLength(1);
    },
    'confirm',
  );
});

for (const decision of ['decline', 'cancel'] as const) {
  test(`handles ${decision} through the public resume API`, async ({
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

        await page.getByTestId(decision).click();

        await expect(driver.assistant()).toHaveText('Action declined.');
        await expect(page.getByTestId('interrupt-count')).toHaveText('0');
        expect(fixture.requests).toHaveLength(0);
      },
      'confirm',
    );
  });
}

for (const serverFirst of [false, true]) {
  test(`preserves mixed tool ownership with ${serverFirst ? 'server' : 'browser'} first`, async ({
    page,
  }, testInfo) => {
    const provider = testInfo.project.metadata['provider'] as
      'openai' | 'azure';
    await withDotnetFixture(provider, async (fixture) => {
      const server = {
        id: 'server-mixed',
        name: 'lookupAirport',
        arguments: { code: 'PDX' },
      };
      const browser = {
        id: 'browser-mixed',
        name: 'getWeather',
        arguments: { city: 'Paris' },
      };
      fixture.mock.onToolResult(serverFirst ? browser.id : server.id, {
        content: 'Mixed complete',
      });
      fixture.mock.onToolResult(serverFirst ? server.id : browser.id, {
        toolCalls: [serverFirst ? browser : server],
      });
      fixture.mock.onMessage('Mixed fixture', {
        toolCalls: [serverFirst ? server : browser],
      });
      const driver = createAppDriver(page);
      await page.goto(
        `/?${new URLSearchParams({ scenario: 'tool', runUrl: `${fixture.url}/run`, retries: '0' })}`,
      );

      await driver.send('Mixed fixture');

      await expect(driver.assistant()).toHaveText('Mixed complete');
      await expect(driver.toolCount()).toHaveText('1');
      expect(
        await (await fetch(`${fixture.url}/__test/counters`)).json(),
      ).toMatchObject({ server: 1 });
      expect(fixture.requests).toHaveLength(3);
    });
  });
}

test('continues a browser tool, confirmation, and server tool without replay', async ({
  page,
}, testInfo) => {
  const provider = testInfo.project.metadata['provider'] as 'openai' | 'azure';
  await withDotnetFixture(
    provider,
    async (fixture) => {
      fixture.mock.onToolResult('protected-server', {
        content: 'Workflow complete',
      });
      fixture.mock.onToolResult('before-confirm', {
        toolCalls: [
          {
            id: 'protected-server',
            name: 'lookupAirport',
            arguments: { code: 'PDX' },
          },
        ],
      });
      fixture.mock.onMessage('Confirm after tool', {
        toolCalls: [
          {
            id: 'before-confirm',
            name: 'getWeather',
            arguments: { city: 'Paris' },
          },
        ],
      });
      const driver = createAppDriver(page);
      await page.goto(
        `/?${new URLSearchParams({ scenario: 'tool', runUrl: `${fixture.url}/run`, retries: '0' })}`,
      );
      await driver.send('Confirm after tool');
      await expect(driver.toolCount()).toHaveText('1');
      await expect(page.getByTestId('interrupt-count')).toHaveText('2');
      expect(
        await (await fetch(`${fixture.url}/__test/counters`)).json(),
      ).toMatchObject({ server: 0 });

      await page.getByTestId('resume').click();

      await expect(driver.assistant()).toHaveText('Workflow complete');
      await expect(driver.toolCount()).toHaveText('1');
      expect(
        await (await fetch(`${fixture.url}/__test/counters`)).json(),
      ).toMatchObject({ server: 1, protected: 1 });
      expect(fixture.requests).toHaveLength(3);
    },
    'after-tool',
  );
});

test('keeps the browser batch while resume is held and rejects its replay over HTTP', async ({
  page,
}, testInfo) => {
  const provider = testInfo.project.metadata['provider'] as 'openai' | 'azure';
  await withDotnetFixture(
    provider,
    async (fixture) => {
      const submitted: Array<Record<string, unknown>> = [];
      page.on('request', (request) => {
        if (
          request.url() === `${fixture.url}/run` &&
          request.method() === 'POST'
        )
          submitted.push(request.postDataJSON());
      });
      const driver = createAppDriver(page);
      await page.goto(
        `/?${new URLSearchParams({ scenario: 'plain', runUrl: `${fixture.url}/run`, retries: '0' })}`,
      );
      await driver.send('Hello fixture');
      await expect(page.getByTestId('interrupt-count')).toHaveText('2');
      const batchId = await page
        .getByTestId('interrupt-batch-id')
        .textContent();

      await page.getByTestId('resume').click();

      await expect(page.getByTestId('is-resuming')).toHaveText('true');
      await expect(page.getByTestId('interrupt-count')).toHaveText('2');
      await expect(page.getByTestId('interrupt-batch-id')).toHaveText(
        batchId ?? '',
      );
      await expect
        .poll(
          async () =>
            (await (await fetch(`${fixture.url}/__test/counters`)).json())
              .checkpointStage,
        )
        .toBe('before');
      expect(fixture.requests).toHaveLength(0);
      await fetch(`${fixture.url}/__test/release-checkpoint`, {
        method: 'POST',
      });
      await expect(driver.assistant()).toHaveText('Hello from .NET');
      await driver.expectIdle();
      const replay = await fetch(`${fixture.url}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...submitted[1], runId: crypto.randomUUID() }),
      });
      expect(replay.status).toBe(409);
      expect(fixture.requests).toHaveLength(1);
      expect(
        await (await fetch(`${fixture.url}/__test/counters`)).json(),
      ).toMatchObject({ protected: 1, protectedCode: 'PDX' });
      expect(submitted[1]['threadId']).toBe(submitted[0]['threadId']);
      expect(submitted[1]['runId']).not.toBe(submitted[0]['runId']);
      expect(submitted[1]['messages']).toEqual(submitted[0]['messages']);
    },
    'confirm-before',
  );
});

test('rejects an expired browser resume before model or protected effects', async ({
  page,
}, testInfo) => {
  const provider = testInfo.project.metadata['provider'] as 'openai' | 'azure';
  await withDotnetFixture(
    provider,
    async (fixture) => {
      const driver = createAppDriver(page);
      await page.goto(
        `/?${new URLSearchParams({ scenario: 'plain', runUrl: `${fixture.url}/run`, retries: '0' })}`,
      );
      await driver.send('Hello fixture');
      await expect(page.getByTestId('interrupt-count')).toHaveText('2');
      await fetch(`${fixture.url}/__test/advance-clock`, { method: 'POST' });
      const response = page.waitForResponse(
        (response) =>
          response.url() === `${fixture.url}/run` &&
          response.request().method() === 'POST',
      );

      await page.getByTestId('resume').click();

      expect((await response).status()).toBe(410);
      await driver.expectIdle();
      await expect(driver.error()).not.toBeEmpty();
      expect(fixture.requests).toHaveLength(0);
      expect(
        await (await fetch(`${fixture.url}/__test/counters`)).json(),
      ).toMatchObject({ protected: 0 });
    },
    'confirm',
  );
});

for (const content of [
  { ui: [{ unexposed: { props: { title: 'Unsafe', count: 1 } } }] },
  { ui: [{ status: { props: { title: 'Invalid', count: 'not a number' } } }] },
]) {
  test(`does not mount ${'unexposed' in content.ui[0] ? 'unexposed components' : 'invalid component props'} from native model output`, async ({
    page,
  }, testInfo) => {
    const provider = testInfo.project.metadata['provider'] as
      'openai' | 'azure';
    const gate = createEventGate();
    await withDotnetFixture(
      provider,
      async (fixture) => {
        fixture.mock.onMessage('Invalid UI fixture', { content });
        const driver = createAppDriver(page);
        await page.goto(
          `/?${new URLSearchParams({ scenario: 'ui', runUrl: `${fixture.url}/run`, retries: '0' })}`,
        );

        await driver.send('Invalid UI fixture');
        await driver.expectLoading();
        gate.releaseThrough(0);

        await driver.expectIdle();
        expect(fixture.requests).toHaveLength(1);
        await expect(page.getByTestId('status-action')).toHaveCount(0);
        await expect(page.getByTestId('status-action-count')).toHaveCount(0);
        if ('unexposed' in content.ui[0])
          await expect(driver.statusCard()).toHaveCount(0);
        else await expect(driver.statusCard()).toHaveText('Invalid');
      },
      '',
      { pauseAfter: 1, gate },
    );
  });
}

test('renders a trusted component with an actual user action', async ({
  page,
}, testInfo) => {
  const provider = testInfo.project.metadata['provider'] as 'openai' | 'azure';
  await withDotnetFixture(provider, async (fixture) => {
    fixture.mock.onMessage('Interactive fixture', {
      content: { ui: [{ status: { props: { title: 'Ready', count: 2 } } }] },
    });
    const driver = createAppDriver(page);
    await page.goto(
      `/?${new URLSearchParams({ scenario: 'ui', runUrl: `${fixture.url}/run`, retries: '0' })}`,
    );
    await driver.send('Interactive fixture');
    await expect(driver.statusCard()).toHaveText('Ready: 2');

    await page.getByTestId('status-action').click();

    await expect(page.getByTestId('status-action-count')).toHaveText('1');
    expect(fixture.requests).toHaveLength(1);
  });
});

test('does not replay an earlier server effect across browser tool and confirmation', async ({
  page,
}, testInfo) => {
  const provider = testInfo.project.metadata['provider'] as 'openai' | 'azure';
  await withDotnetFixture(
    provider,
    async (fixture) => {
      fixture.mock.onToolResult('historical-browser', {
        content: 'History complete',
      });
      fixture.mock.onToolResult('historical-server', {
        toolCalls: [
          {
            id: 'historical-browser',
            name: 'getWeather',
            arguments: { city: 'Paris' },
          },
        ],
      });
      fixture.mock.onMessage('History fixture', {
        toolCalls: [
          {
            id: 'historical-server',
            name: 'lookupAirport',
            arguments: { code: 'PDX' },
          },
        ],
      });
      const driver = createAppDriver(page);
      await page.goto(
        `/?${new URLSearchParams({ scenario: 'tool', runUrl: `${fixture.url}/run`, retries: '0' })}`,
      );
      await driver.send('History fixture');
      await expect(page.getByTestId('interrupt-count')).toHaveText('2');
      expect(
        await (await fetch(`${fixture.url}/__test/counters`)).json(),
      ).toMatchObject({ server: 1, protected: 0 });
      await expect(driver.toolCount()).toHaveText('1');

      await page.getByTestId('resume').click();

      await expect(driver.assistant()).toHaveText('History complete');
      await driver.expectIdle();
      await expect(driver.toolCount()).toHaveText('1');
      expect(
        await (await fetch(`${fixture.url}/__test/counters`)).json(),
      ).toMatchObject({ server: 1, protected: 1 });
      expect(fixture.requests).toHaveLength(3);
      const finalHistory = fixture.requests[2].body.messages as Array<{
        role: string;
        tool_call_id?: string;
      }>;
      expect(
        finalHistory.filter(
          (message) => message.tool_call_id === 'historical-server',
        ),
      ).toHaveLength(1);
      expect(
        finalHistory.filter(
          (message) => message.tool_call_id === 'historical-browser',
        ),
      ).toHaveLength(1);
    },
    'after-tool',
  );
});
