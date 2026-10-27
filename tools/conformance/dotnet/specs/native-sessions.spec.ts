import { expect, test, type Page } from '@playwright/test';
import { createAppDriver } from '../../harness/app-driver';
import {
  control,
  projectModelApi,
  withDurableCluster,
} from '../harness/browser-fixture';
import type { DotnetFixture } from '../harness/http-fixture';
import {
  expectNativeRunCapture,
  expectNativeToolPairs,
  nativeHistory,
} from '../harness/native-wire';
import { withRoutedEndpoint } from '../harness/routed-endpoint';

const nativeEnvironment = { FixtureNativeSessions: 'true', Workflow: '' };
const answer = 'Native mixed tools completed';
const weather = (id: string, city = 'Paris') => ({
  id,
  name: 'getWeather',
  arguments: { city },
});
const airport = (id: string, code = 'PDX') => ({
  id,
  name: 'lookupAirport',
  arguments: { code },
});
type Call = ReturnType<typeof weather> | ReturnType<typeof airport>;

function configure(fixture: DotnetFixture, prompt: string, calls: Call[]) {
  for (const call of calls)
    fixture.mock.onToolResult(call.id, { content: answer });
  fixture.mock.onMessage(prompt, { toolCalls: calls });
}

function pairs(calls: Call[]) {
  // Native bypass initially publishes browser calls only; stored backend calls appear on continuation.
  return [
    ...calls.filter((call) => call.name === 'getWeather'),
    ...calls.filter((call) => call.name === 'lookupAirport'),
  ].map((call) => ({
    id: call.id,
    name: call.name,
    arguments: JSON.stringify(call.arguments),
    output:
      'city' in call.arguments
        ? JSON.stringify({
            city: call.arguments.city,
            temperatureC: 21,
            condition: 'sunny',
          })
        : JSON.stringify(
            {
              code: call.arguments.code,
              name: 'Portland International Airport',
            },
            null,
            2,
          ),
  }));
}

async function effects(fixture: DotnetFixture) {
  const response = await fetch(`${fixture.url}/__test/native-effects`);
  expect(response.ok).toBe(true);
  return (await response.json()) as {
    count: number;
    rows: Array<{ id: number; code: string }>;
  };
}

async function stage(
  fixture: DotnetFixture,
  expected: string,
  responseBody?: () => string,
) {
  try {
    await expect
      .poll(
        async () =>
          (await (await fetch(`${fixture.url}/__test/native-stage`)).json())
            .stage,
      )
      .toBe(expected);
  } catch (error) {
    await test.info().attach('native-stage-diagnostics', {
      body: JSON.stringify(
        {
          expected,
          requests: fixture.requests,
          diagnostics: fixture.diagnostics(),
          response: responseBody?.(),
        },
        null,
        2,
      ),
      contentType: 'application/json',
    });
    throw error;
  }
}

async function open(page: Page, endpoint: string) {
  await page.goto(
    `/?${new URLSearchParams({ scenario: 'tool', runUrl: endpoint, recoveryUrl: new URL(endpoint).origin, recoveryMode: 'native', fixturePrincipal: 'alice', retries: '0' })}`,
  );
  return createAppDriver(page);
}

for (const [name, calls] of [
  ['browser-first', [weather('browser-first'), airport('server-second')]],
  ['server-first', [airport('server-first'), weather('browser-second')]],
  [
    'multiple-siblings',
    [
      airport('server-one'),
      weather('browser-one'),
      airport('server-two', 'SEA'),
      weather('browser-two', 'Portland'),
    ],
  ],
] as const) {
  test(`native ${name} waits for durable publication and preserves exact history`, async ({
    page,
  }, info) => {
    const provider = info.project.metadata['provider'] as 'openai' | 'azure';
    await withDurableCluster(
      provider,
      async (cluster) => {
        const fixture = await cluster.start({
          NativeGate: 'before-pending-save',
        });
        const prompt = `Native ${name}`;
        configure(fixture, prompt, [...calls]);
        await withRoutedEndpoint(`${fixture.url}/run`, async (endpoint) => {
          const driver = await open(page, endpoint.url);

          await driver.send(prompt);
          await stage(
            fixture,
            'before-pending-save',
            () => endpoint.responses[0]?.body ?? '',
          );
          for (const call of calls.filter((call) => call.name === 'getWeather'))
            await expect
              .poll(() => endpoint.responses[0]?.body ?? '')
              .toContain(call.id);

          await expect(driver.toolCount()).toHaveText('0');
          expect((await effects(fixture)).count).toBe(0);
          expect(endpoint.requests).toHaveLength(1);
          expect(endpoint.responses[0].body).not.toContain('RUN_FINISHED');
          expect(fixture.requests).toHaveLength(1);
          await control(fixture, 'release-native');
          await expect(driver.assistant()).toHaveText(answer);
          await driver.expectIdle();
          const browserCalls = calls.filter(
            (call) => call.name === 'getWeather',
          );
          const serverCalls = calls.filter(
            (call) => call.name === 'lookupAirport',
          );
          await expect(driver.toolCount()).toHaveText(
            String(browserCalls.length),
          );
          const initialEvents = expectNativeRunCapture(endpoint.responses[0]);
          expect(
            initialEvents
              .filter((event) => event.type === 'TOOL_CALL_START')
              .map((event) => ({
                id: event.toolCallId,
                name: event.toolCallName,
              })),
          ).toEqual(
            browserCalls.map((call) => ({ id: call.id, name: call.name })),
          );
          const initial = endpoint.responses[0].body;
          for (const call of browserCalls) expect(initial).toContain(call.id);
          for (const call of serverCalls)
            expect(initial).not.toContain(call.id);
          expect(initial).toContain('RUN_FINISHED');
          expect(fixture.requests).toHaveLength(2);
          expectNativeToolPairs(
            fixture.requests[1],
            projectModelApi(),
            pairs([...calls]),
          );
          const persisted = await effects(fixture);
          expect(persisted.count).toBe(serverCalls.length);
          expect(persisted.rows.map((row) => row.code).sort()).toEqual(
            serverCalls
              .map((call) =>
                'code' in call.arguments ? call.arguments.code : '',
              )
              .sort(),
          );

          await driver.send('Hello fixture');
          await expect(driver.assistant()).toHaveText('Hello from .NET');
          await driver.expectIdle();

          expect(fixture.requests).toHaveLength(3);
          expectNativeToolPairs(
            fixture.requests[2],
            projectModelApi(),
            pairs([...calls]),
          );
          expect((await effects(fixture)).count).toBe(serverCalls.length);
          await info.attach('native-mixed-requests', {
            body: JSON.stringify(fixture.requests, null, 2),
            contentType: 'application/json',
          });
        });
      },
      nativeEnvironment,
    );
  });
}

test('native pending callback survives process death and continues unchanged on another instance', async ({
  page,
}, info) => {
  const provider = info.project.metadata['provider'] as 'openai' | 'azure';
  await withDurableCluster(
    provider,
    async (cluster) => {
      const first = await cluster.start();
      const calls = [airport('restart-server'), weather('restart-browser')];
      configure(first, 'Native restart', calls);
      await withRoutedEndpoint(`${first.url}/run`, async (endpoint) => {
        let count = 0;
        let captured = '';
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        await page.route(endpoint.url, async (route) => {
          if (route.request().method() !== 'POST') {
            await route.continue();
            return;
          }
          if (++count === 2) {
            captured = route.request().postData() ?? '';
            await gate;
          }
          await route.continue();
        });
        try {
          const driver = await open(page, endpoint.url);
          await driver.send('Native restart');
          await expect.poll(() => captured).not.toBe('');
          await expect(driver.toolCount()).toHaveText('1');
          expect((await effects(first)).count).toBe(0);
          await first.stop();
          const second = await cluster.start();
          for (const call of calls)
            second.mock.onToolResult(call.id, { content: answer });
          endpoint.routeTo(`${second.url}/run`);

          release();
          await expect(driver.assistant()).toHaveText(answer);
          await driver.expectIdle();

          expect(endpoint.requests[1]).toBe(captured);
          expect(first.requests).toHaveLength(1);
          expect(second.requests).toHaveLength(1);
          expectNativeToolPairs(
            second.requests[0],
            projectModelApi(),
            pairs(calls),
          );
          expect((await effects(second)).count).toBe(1);
        } finally {
          release();
          await page.unroute(endpoint.url);
        }
      });
    },
    nativeEnvironment,
  );
});

test('native reload reports missing browser results without rerunning tools and allows a fresh thread', async ({
  page,
}, info) => {
  const provider = info.project.metadata['provider'] as 'openai' | 'azure';
  await withDurableCluster(
    provider,
    async (cluster) => {
      const fixture = await cluster.start();
      configure(fixture, 'Native missing result', [
        weather('missing-browser'),
        airport('missing-server'),
      ]);
      let count = 0;
      let captured = false;
      await page.route(`${fixture.url}/run`, async (route) => {
        if (route.request().method() !== 'POST') {
          await route.continue();
          return;
        }
        if (++count === 2) {
          captured = true;
          await route.abort('aborted');
        } else await route.continue();
      });
      const driver = await open(page, `${fixture.url}/run`);
      await driver.send('Native missing result');
      await expect.poll(() => captured).toBe(true);
      await expect(driver.toolCount()).toHaveText('1');

      await page.reload();
      const recovered = page.waitForResponse((response) =>
        response.url().endsWith('/native-session'),
      );
      await page.getByTestId('refresh-recovery').click();

      const envelope = await (await recovered).json();
      expect(envelope).not.toHaveProperty('snapshot');
      expect(envelope.serverRevision).toEqual(expect.any(Number));

      await expect(page.getByTestId('recovery-status')).toHaveText(
        'NativePendingBrowserResults',
      );
      await expect(page.getByTestId('send')).toBeDisabled();
      await expect(driver.toolCount()).toHaveText('0');
      expect(fixture.requests).toHaveLength(1);
      expect((await effects(fixture)).count).toBe(0);
      await page.getByTestId('refresh-recovery').click();
      await expect(page.getByTestId('recovery-fetching')).toHaveText('false');
      expect(fixture.requests).toHaveLength(1);
      await page.getByTestId('new-thread').click();
      await driver.send('Hello fixture');
      await expect(driver.assistant()).toHaveText('Hello from .NET');
      await driver.expectIdle();
      expect((await effects(fixture)).count).toBe(0);
    },
    nativeEnvironment,
  );
});

test('native completed cold recovery restores canonical history without historical tool execution', async ({
  page,
}, info) => {
  const provider = info.project.metadata['provider'] as 'openai' | 'azure';
  await withDurableCluster(
    provider,
    async (cluster) => {
      const fixture = await cluster.start();
      const calls = [weather('cold-browser'), airport('cold-server')];
      configure(fixture, 'Native cold recovery', calls);
      const driver = await open(page, `${fixture.url}/run`);
      await driver.send('Native cold recovery');
      await expect(driver.assistant()).toHaveText(answer);
      await driver.expectIdle();

      await page.reload();
      await page.getByTestId('refresh-recovery').click();

      await expect(page.getByTestId('recovery-status')).toHaveText('Completed');
      await expect(driver.assistant()).toHaveText(answer);
      await expect(driver.toolCount()).toHaveText('0');
      expect(fixture.requests).toHaveLength(2);
      expect((await effects(fixture)).count).toBe(1);
      await driver.send('Hello fixture');
      await expect(driver.assistant()).toHaveText('Hello from .NET');
      await driver.expectIdle();
      expectNativeToolPairs(
        fixture.requests[2],
        projectModelApi(),
        pairs(calls),
      );
      expect(
        nativeHistory(fixture.requests[2], projectModelApi()).filter(
          (message) => message.role === 'system',
        ),
      ).toHaveLength(1);
      expect((await effects(fixture)).count).toBe(1);
    },
    nativeEnvironment,
  );
});
