import {
  type ChatCompletionRequest,
  type FixtureResponse,
  LLMock,
} from '@copilotkit/aimock';
import {
  test as base,
  expect,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  installNativeToolObserver,
  installNativeToolShim,
} from './native-tool-shim';

const live = process.env['LOCAL_LLM_NATIVE_TOOL_WORKFLOWS_LIVE'] === '1';
const test = live
  ? base.extend({
      context: async ({ playwright, baseURL, launchOptions }, use) => {
        const context = await playwright.chromium.launchPersistentContext(
          process.env['LOCAL_LLM_PROFILE'] ??
            join(tmpdir(), 'hashbrown-native-tools-model-profile'),
          { ...launchOptions, channel: 'chrome', headless: false, baseURL },
        );
        try {
          await use(context);
        } finally {
          await context.close();
        }
      },
    })
  : base;

type Scenario = 'lookup' | 'dependent' | 'final-tool' | 'malformed' | 'stop';
/** Builds calls alongside prose that must stay out of canonical history. */
const call = (id: string, name: string, args: object): FixtureResponse => ({
  content: 'PRIVATE_PLANNING_PROSE',
  toolCalls: [{ id, name, arguments: JSON.stringify(args) }],
});
/** Scripts native phases from actual handler results, never a preselected secret. */
function respond(
  scenario: Scenario,
  request: ChatCompletionRequest,
): FixtureResponse {
  const results = request.messages.filter((message) => message.role === 'tool');
  const finalizing = !!(request as unknown as { response_format?: unknown })
    .response_format;
  if (finalizing) {
    if (scenario === 'final-tool')
      return call('forbidden', 'lookup_secret', { record: 'beta' });
    if (scenario === 'malformed') return { content: 'THIS_IS_NOT_JSON' };
    const result = JSON.parse(String(results.at(-1)?.content ?? '{}')) as {
      token?: string;
      receipt?: string;
    };
    return {
      content: JSON.stringify({ value: result.receipt ?? result.token }),
    };
  }
  if (!results.length)
    return call('lookup', 'lookup_secret', { record: 'alpha' });
  if (scenario === 'dependent' && results.length === 1) {
    const result = JSON.parse(String(results[0].content)) as { token: string };
    return call('follow', 'follow_secret', { token: result.token });
  }
  return { content: 'PRIVATE_PLANNING_PROSE' };
}
/** Retains raw native prompts/chunks and transport lifecycle for every result. */
async function evidence(page: Page) {
  return page.evaluate(() => {
    const runtime = globalThis as unknown as {
      __nativeToolNativeEvents?: unknown[];
      __nativeToolRequests?: unknown[];
      __nativeToolCanonical?: unknown[];
      __nativeToolActive?: () => number;
      __hashbrownNativeTools?: { created: number; destroyed: number };
    };
    return {
      events: runtime.__nativeToolNativeEvents,
      requests: runtime.__nativeToolRequests,
      canonical: runtime.__nativeToolCanonical,
      active: runtime.__nativeToolActive?.(),
      sessions: runtime.__hashbrownNativeTools,
    };
  });
}
/** Runs an opt-in schema workflow without allowing downloads or HTTP fallback. */
async function workflow(
  page: Page,
  info: TestInfo,
  scenario: Scenario,
  run: () => Promise<void>,
) {
  const mock = live
    ? undefined
    : new LLMock({
        port: 0,
        chunkSize: 3,
        latency: scenario === 'stop' ? 150 : 1,
      });
  mock?.onMessage(/./, (request) => respond(scenario, request));
  const errors: string[] = [];
  const fallback: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.url().includes('/unused')) fallback.push(request.url());
  });
  await mock?.start();
  try {
    if (mock) await installNativeToolShim(page, mock.url, true);
    else await installNativeToolObserver(page);
    await page.goto(
      '/?localSchemaWorkflow=true&localModel=chrome-tools-schema&runUrl=' +
        encodeURIComponent('http://127.0.0.1:1/unused'),
    );
    await run();
    expect(errors).toEqual([]);
    expect(fallback).toEqual([]);
    await expect.poll(async () => (await evidence(page)).active).toBe(0);
    await expect
      .poll(async () => {
        const value = (await evidence(page)).sessions;
        return !!value?.created && value.created === value.destroyed;
      })
      .toBe(true);
  } finally {
    await info.attach('native-schema-evidence.json', {
      contentType: 'application/json',
      body: JSON.stringify(
        {
          live,
          scenario,
          project: info.project.name,
          profile: process.env['LOCAL_LLM_PROFILE'],
          evidence: await evidence(page).catch(() => null),
          errors,
          fallback,
          journal: mock?.getRequests(),
          body: await page
            .locator('body')
            .innerText()
            .catch(() => null),
        },
        null,
        2,
      ),
    });
    await mock?.stop();
  }
}
/** Starts a real framework generation through the fixture's trusted click. */
async function send(page: Page, dependent = false) {
  await page
    .getByTestId('prompt')
    .fill(
      dependent
        ? 'Schema workflow: call lookup_secret for alpha, then follow_secret with its exact token. Return an object with only value containing the exact receipt from follow_secret.'
        : 'Schema workflow: call lookup_secret for alpha exactly once. Return an object with only value containing the exact token from lookup_secret.',
    );
  await page.getByTestId('send').click();
}

for (const scenario of ['lookup', 'dependent'] as const) {
  test(`native schema ${scenario} consumes exact tool results after unconstrained planning`, async ({
    page,
  }, info) => {
    await workflow(page, info, scenario, async () => {
      await send(page, scenario === 'dependent');

      await expect(page.getByTestId('operation-count')).toHaveText(
        scenario === 'dependent' ? '2' : '1',
      );
      await expect(page.getByTestId('status')).toHaveText('idle');
      await expect(page.getByTestId('error')).toBeEmpty();
      const operations = JSON.parse(
        await page.getByTestId('operations').innerText(),
      ) as { name: string; record?: string; token: string; receipt?: string }[];
      expect(operations[0]).toMatchObject({
        name: 'lookup_secret',
        record: 'alpha',
      });
      let value: string;
      if (scenario === 'dependent') {
        expect(operations.map((operation) => operation.name)).toEqual([
          'lookup_secret',
          'follow_secret',
        ]);
        expect(operations[1].token).toBe(operations[0].token);
        expect(operations[1].receipt).toMatch(/^HB_RECEIPT_/);
        const receipt = operations[1].receipt;
        if (typeof receipt !== 'string')
          throw new Error('Dependent handler did not return a receipt.');
        value = receipt;
      } else {
        expect(operations.map((operation) => operation.name)).toEqual([
          'lookup_secret',
        ]);
        value = operations[0].token;
      }
      expect(
        JSON.parse(await page.getByTestId('assistant').innerText()),
      ).toEqual({ value });
      const history = await page.getByTestId('history').innerText();
      expect(history).not.toContain('PRIVATE_PLANNING_PROSE');
      expect(history).not.toContain('Return the final answer');
      const observed = await evidence(page);
      if (!live) {
        const requests = observed.requests as {
          response_format?: { json_schema: { schema: object } };
          messages: { role: string; content: unknown }[];
        }[];
        expect(requests).toHaveLength(scenario === 'dependent' ? 4 : 3);
        expect(
          requests.slice(0, -1).every((request) => !request.response_format),
        ).toBe(true);
        expect(
          requests.at(-1)?.response_format?.json_schema.schema,
        ).toMatchObject({
          type: 'object',
          properties: { value: { type: 'string' } },
        });
        expect(observed.sessions?.created).toBe(
          scenario === 'dependent' ? 3 : 2,
        );
        await page
          .getByTestId('prompt')
          .fill(
            'Schema workflow: without calling tools, return the previous exact value.',
          );
        await page.getByTestId('send').click();
        await expect
          .poll(async () => ((await evidence(page)).requests ?? []).length)
          .toBe(requests.length + 2);
        await expect(page.getByTestId('status')).toHaveText('idle');
        await expect(page.getByTestId('error')).toBeEmpty();
        expect(
          JSON.parse(await page.getByTestId('assistant').innerText()),
        ).toEqual({ value });
        await expect(page.getByTestId('operation-count')).toHaveText(
          scenario === 'dependent' ? '2' : '1',
        );
        const replay = ((await evidence(page)).canonical as unknown[][])[
          requests.length
        ];
        expect(JSON.stringify(replay)).toContain(value);
        expect(JSON.stringify(replay)).not.toContain('PRIVATE_PLANNING_PROSE');
        expect(JSON.stringify(replay)).not.toContain('Return the final answer');
      } else {
        const events = observed.events as {
          phase: string;
          options?: { responseConstraint?: object };
          value?: unknown;
        }[];
        const final = events.findLastIndex((event) => event.phase === 'prompt');
        expect(events[final].options?.responseConstraint).toMatchObject({
          type: 'object',
          properties: { value: { type: 'string' } },
        });
        const text = events
          .slice(final + 1)
          .filter(
            (event) =>
              event.phase === 'chunk' && typeof event.value === 'string',
          )
          .map((event) => event.value)
          .join('');
        expect(JSON.parse(text)).toEqual({ value });
      }
    });
  });
}

if (!live) {
  for (const scenario of ['final-tool', 'malformed'] as const) {
    test(`native schema rejects ${scenario} without additional side effects`, async ({
      page,
    }, info) => {
      await workflow(page, info, scenario, async () => {
        await send(page);

        await expect(page.getByTestId('error')).not.toBeEmpty();
        await expect(page.getByTestId('status')).toHaveText('idle');
        await expect(page.getByTestId('operation-count')).toHaveText('1');
        await expect(page.getByTestId('assistant')).toBeEmpty();
      });
    });
  }
  test('native schema Stop during finalization tears down and recovers', async ({
    page,
  }, info) => {
    await workflow(page, info, 'stop', async () => {
      await send(page);
      await expect
        .poll(async () =>
          (
            ((await evidence(page)).requests as {
              response_format?: unknown;
            }[]) ?? []
          ).some((request) => request.response_format),
        )
        .toBe(true);
      await page.getByTestId('stop').click();
      await expect(page.getByTestId('status')).toHaveText('idle');
      await expect.poll(async () => (await evidence(page)).active).toBe(0);
      const before = (await evidence(page)).sessions?.created ?? 0;

      await send(page);

      await expect
        .poll(async () => (await evidence(page)).sessions?.created ?? 0)
        .toBeGreaterThan(before);
      await expect(page.getByTestId('status')).toHaveText('idle');
      await expect(page.getByTestId('error')).toBeEmpty();
      expect(
        JSON.parse(await page.getByTestId('assistant').innerText()).value,
      ).toMatch(/^HB_alpha_/);
    });
  });
}
