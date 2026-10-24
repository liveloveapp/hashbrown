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

const prompts = {
  lookup:
    'Lookup workflow: call lookup_secret for alpha exactly once. Return only the exact token from its result, no other text.',
  dependent:
    'Dependent workflow: call lookup_secret for alpha, then call follow_secret with its exact token as token. Return only the exact receipt from follow_secret, no other text.',
  protected:
    'Protected workflow: call protected_lookup for alpha exactly once. If denied do not retry and return only HB_PERMISSION_DENIED. Otherwise return only the exact token from the result.',
  confirm:
    'Confirm workflow: without calling any tools, return only the previous exact token or receipt. If permission was denied return only HB_PERMISSION_DENIED.',
};
type Scenario =
  | 'lookup'
  | 'dependent'
  | 'protected'
  | 'independent'
  | 'ambiguous'
  | 'null'
  | 'unknown'
  | 'stop';
/** Scripts model responses from actual framework results, independently of canonical IDs. */
function respond(
  scenario: Scenario,
  request: ChatCompletionRequest,
): FixtureResponse {
  if (
    scenario === 'stop' &&
    String(
      request.messages.filter((message) => message.role === 'user').at(-1)
        ?.content,
    ).startsWith('Lookup')
  )
    return respond('lookup', request);
  const results = request.messages.filter((message) => message.role === 'tool');
  const call = (id: string, name: string, args: unknown) => ({
    id,
    name,
    arguments: JSON.stringify(args),
  });
  const values = results.map((result) => {
    try {
      return JSON.parse(String(result.content)) as {
        token?: string;
        receipt?: string;
      };
    } catch {
      return {};
    }
  });
  if (results.length) {
    if (
      scenario === 'dependent' &&
      results.length === 1 &&
      !String(request.messages.at(-1)?.content).startsWith('Confirm')
    )
      return {
        toolCalls: [
          call('follow-alpha', 'follow_secret', { token: values[0].token }),
        ],
      };
    return {
      content: results.some((result) =>
        String(result.content).includes('HB_PERMISSION_DENIED'),
      )
        ? 'HB_PERMISSION_DENIED'
        : scenario === 'dependent'
          ? (values.at(-1)?.receipt ?? '')
          : values
              .map((value) => value.token ?? '')
              .filter(Boolean)
              .join(' '),
    };
  }
  if (scenario === 'stop') return { content: 'Still streaming '.repeat(1000) };
  if (scenario === 'independent' || scenario === 'ambiguous')
    return {
      toolCalls: [
        call('lookup-alpha', 'lookup_secret', { record: 'alpha' }),
        call('lookup-beta', 'lookup_secret', { record: 'beta' }),
      ],
    };
  return {
    toolCalls: [
      call(
        'lookup-alpha',
        scenario === 'unknown'
          ? 'missing_tool'
          : scenario === 'protected'
            ? 'protected_lookup'
            : 'lookup_secret',
        scenario === 'null' ? null : { record: 'alpha' },
      ),
    ],
  };
}
type Evidence = {
  requests: {
    messages: {
      role: string;
      tool_call_id?: string;
      tool_calls?: {
        id: string;
        function: { name: string; arguments: string };
      }[];
      content: unknown;
      error?: string;
    }[];
  }[];
  canonical: unknown[];
  lifecycle: string[];
  active: number;
  nativeEvents?: object[];
  sourceBoundaryVerified: boolean;
  sessions?: { created: number; destroyed: number };
};
/** Reads transport observations while retaining prototype-backed native values explicitly. */
async function evidence(page: Page): Promise<Evidence> {
  return page.evaluate(() => {
    const runtime = globalThis as unknown as {
      __nativeToolNativeEvents?: object[];
      __nativeToolSourceBoundaryVerified?: boolean;
      __nativeToolRequests?: Evidence['requests'];
      __nativeToolCanonical?: unknown[];
      __nativeToolLifecycle?: string[];
      __nativeToolActive?: () => number;
      __hashbrownNativeTools?: Evidence['sessions'];
    };
    return {
      nativeEvents: runtime.__nativeToolNativeEvents,
      sourceBoundaryVerified:
        runtime.__nativeToolSourceBoundaryVerified === true,
      requests: runtime.__nativeToolRequests ?? [],
      canonical: runtime.__nativeToolCanonical ?? [],
      lifecycle: runtime.__nativeToolLifecycle ?? [],
      active: runtime.__nativeToolActive?.() ?? 0,
      sessions: runtime.__hashbrownNativeTools,
    };
  });
}
/** Runs actual framework tools and saves all partial observations on failure. */
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
        latency: scenario === 'stop' ? 100 : 1,
      });
  mock?.onMessage(/workflow:/i, (request) => respond(scenario, request));
  const errors: string[] = [];
  const fallback: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.url().includes('/unused')) fallback.push(request.url());
  });
  await mock?.start();
  try {
    if (mock)
      await installNativeToolShim(page, mock.url, scenario === 'independent');
    else await installNativeToolObserver(page);
    await page.goto(
      '/?localWorkflow=true&localModel=chrome-tools&runUrl=' +
        encodeURIComponent('http://127.0.0.1:1/unused'),
    );

    await run();

    expect(fallback).toEqual([]);
    expect(errors).toEqual([]);
    await expect.poll(async () => (await evidence(page)).active).toBe(0);
    await expect
      .poll(async () => {
        const value = await evidence(page);
        return (
          value.sessions?.created === value.sessions?.destroyed &&
          (value.sessions?.created ?? 0) > 0
        );
      })
      .toBe(true);
    const observed = await evidence(page);
    if (!live) {
      expect(
        observed.lifecycle.filter((value) => value === 'created').length,
      ).toBe(
        observed.lifecycle.filter((value) => value === 'destroyed').length,
      );
      expect(observed.requests.length).toBeGreaterThan(0);
      expect(observed.sessions?.created).toBe(observed.requests.length);
      for (const request of observed.requests) {
        const calls = request.messages.flatMap(
          (message) => message.tool_calls ?? [],
        );
        for (const result of request.messages.filter(
          (message) => message.role === 'tool',
        ))
          expect(
            calls.filter((call) => call.id === result.tool_call_id),
          ).toHaveLength(1);
      }
    }
  } finally {
    await info.attach('native-framework-evidence.json', {
      body: JSON.stringify(
        {
          live,
          profile: live
            ? (process.env['LOCAL_LLM_PROFILE'] ??
              join(tmpdir(), 'hashbrown-native-tools-model-profile'))
            : undefined,
          scenario,
          project: info.project.name,
          browser: page.context().browser()?.version(),
          flags: info.project.use.launchOptions?.args,
          evidence: await evidence(page).catch(() => null),
          errors,
          fallback,
          journal: mock?.getRequests(),
          operations: await page
            .getByTestId('operations')
            .textContent({ timeout: 1000 })
            .catch(() => null),
          answer: await page
            .getByTestId('assistant')
            .textContent({ timeout: 1000 })
            .catch(() => null),
          error: await page
            .getByTestId('error')
            .textContent({ timeout: 1000 })
            .catch(() => null),
        },
        null,
        2,
      ),
      contentType: 'application/json',
    });
    await mock?.stop();
  }
}
/** Sends through an actual trusted fixture click. */
async function send(page: Page, prompt: string) {
  const created = (await evidence(page)).sessions?.created ?? 0;
  await page.getByTestId('prompt').fill(prompt);
  await page.getByTestId('send').click();
  await expect
    .poll(
      async () =>
        ((await evidence(page)).sessions?.created ?? 0) > created ||
        !!(await page.getByTestId('error').textContent()),
    )
    .toBe(true);
  if (((await evidence(page)).sessions?.created ?? 0) <= created)
    throw new Error(await page.getByTestId('error').innerText());
}
/** Reads application-owned effects, whose random secrets are never placed in model prompts. */
async function operations(
  page: Page,
): Promise<{ token: string; receipt?: string; record?: string }[]> {
  return JSON.parse(await page.getByTestId('operations').innerText());
}
/** Waits for a successful settled framework run. */
async function settled(page: Page) {
  await expect(page.getByTestId('status')).toHaveText('idle');
  await expect(page.getByTestId('error')).toBeEmpty();
}

/** Checks both rendered text and every bare-string native chunk of the final turn. */
async function exactAnswer(page: Page, expected: string) {
  await settled(page);
  if (live) {
    const events = (await evidence(page)).nativeEvents as {
      phase: string;
      sessionId: number;
      value?: unknown;
    }[];
    const lastPrompt = events.findLastIndex(
      (event) => event.phase === 'prompt',
    );
    expect(lastPrompt).toBeGreaterThanOrEqual(0);
    const text = events
      .slice(lastPrompt + 1)
      .flatMap((event) =>
        event.phase === 'chunk' &&
        event.sessionId === events[lastPrompt].sessionId &&
        typeof event.value === 'string'
          ? [event.value]
          : [],
      )
      .join('');
    expect(text, 'Exact native final text; no model-copy normalization').toBe(
      expected,
    );
  }
  await expect(page.getByTestId('assistant')).toHaveText(expected, {
    timeout: 1000,
  });
}

test('native lookup preserves exact hidden result and authoritative second-turn history', async ({
  page,
}, info) => {
  await workflow(page, info, 'lookup', async () => {
    await send(page, prompts.lookup);

    await expect(page.getByTestId('operation-count')).toHaveText('1');
    await settled(page);
    const lookup = (await operations(page))[0];
    expect(lookup.record).toBe('alpha');
    const token = lookup.token;
    await exactAnswer(page, token);
    const before = await evidence(page);
    if (!live)
      expect(
        before.requests
          .at(-1)
          ?.messages.find((message) => message.role === 'tool')?.tool_call_id,
      ).toMatch(
        /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
      );

    await send(page, prompts.confirm);

    await exactAnswer(page, token);
    await settled(page);
    await expect(page.getByTestId('operation-count')).toHaveText('1');
    if (!live) {
      const after = await evidence(page);
      expect(after.requests).toHaveLength(before.requests.length + 1);
      expect(
        after.requests
          .at(-1)
          ?.messages.slice(0, before.requests.at(-1)?.messages.length),
      ).toEqual(before.requests.at(-1)?.messages);
    }
  });
});

test('native dependent tool receives exact prior token and returns exact receipt', async ({
  page,
}, info) => {
  await workflow(page, info, 'dependent', async () => {
    await send(page, prompts.dependent);

    await expect(page.getByTestId('operation-count')).toHaveText('2');
    await settled(page);
    const effects = await operations(page);
    expect(effects[0].record).toBe('alpha');
    expect(effects[1].token).toBe(effects[0].token);
    // Final text may contain only the final receipt, never a fabricated token.
    expect(effects[1].receipt).toEqual(expect.any(String));
    await exactAnswer(page, String(effects[1].receipt));
  });
});

for (const allowed of [true, false]) {
  test(`native application permission ${allowed ? 'allows' : 'denies'} before side effects`, async ({
    page,
  }, info) => {
    await workflow(page, info, 'protected', async () => {
      await send(page, prompts.protected);

      await expect(page.getByTestId('permission-pending')).toHaveText('true');
      await expect(page.getByTestId('operation-count')).toHaveText('0');

      await page
        .getByTestId(allowed ? 'permission-allow' : 'permission-deny')
        .click();

      await settled(page);
      await expect(page.getByTestId('operation-count')).toHaveText(
        allowed ? '1' : '0',
      );
      const answer = allowed
        ? (await operations(page))[0].token
        : 'HB_PERMISSION_DENIED';
      await exactAnswer(page, answer);
      if (!allowed) {
        if (!live)
          expect(
            (await evidence(page)).requests
              .at(-1)
              ?.messages.find((message) => message.role === 'tool'),
          ).toMatchObject({
            error: expect.stringContaining('HB_PERMISSION_DENIED'),
          });

        await send(page, prompts.confirm);

        await exactAnswer(page, answer);
        await settled(page);
        await expect(page.getByTestId('operation-count')).toHaveText('0');
      }
    });
  });
}

if (!live) {
  for (const scenario of ['ambiguous', 'null', 'unknown'] as const) {
    test(`native ${scenario} call rejects before any handler executes`, async ({
      page,
    }, info) => {
      await workflow(page, info, scenario, async () => {
        await send(page, 'Invalid workflow: return the scripted invalid call.');

        await expect(page.getByTestId('error')).not.toBeEmpty();
        await expect(page.getByTestId('status')).toHaveText('idle');
        await expect(page.getByTestId('operation-count')).toHaveText('0');
      });
    });
  }
  test('native multiple valid IDs correlate independent results', async ({
    page,
  }, info) => {
    await workflow(page, info, 'independent', async () => {
      await send(
        page,
        'Independent workflow: call lookup_secret for alpha and beta.',
      );

      await expect(page.getByTestId('operation-count')).toHaveText('2');
      await settled(page);
      const effects = await operations(page);
      expect(effects.map((effect) => effect.record).sort()).toEqual([
        'alpha',
        'beta',
      ]);
      await expect(page.getByTestId('assistant')).toHaveText(
        effects.map((effect) => effect.token).join(' '),
      );
      const results = (await evidence(page)).requests
        .at(-1)
        ?.messages.filter((message) => message.role === 'tool');
      expect(results?.map((result) => result.tool_call_id).sort()).toEqual([
        'lookup-alpha',
        'lookup-beta',
      ]);
    });
  });
}

/** Proves native cancellation ownership before any model-quality assertion can fail. */
async function verifyNativeStopBoundary(page: Page) {
  const observed = await evidence(page);
  const events = observed.nativeEvents as {
    phase: string;
    sessionId: number;
    at: number;
    error?: string;
  }[];
  const created = events.filter((event) => event.phase === 'created');
  const destroyed = events.filter((event) => event.phase === 'destroyed');
  expect(created.length).toBeGreaterThanOrEqual(2);
  const oldId = created[0].sessionId;
  const oldDestroy = destroyed.find((event) => event.sessionId === oldId);
  const freshCreate = events.find(
    (event) => event.phase === 'create-start' && event.sessionId !== oldId,
  );
  expect(oldDestroy).toBeDefined();
  expect(freshCreate).toBeDefined();
  expect(
    events.find(
      (event) => event.phase === 'stream-error' && event.sessionId === oldId,
    )?.error,
  ).toContain('AbortError');
  expect(
    events.some(
      (event) =>
        event.phase === 'stream-cancelled' && event.sessionId === oldId,
    ),
  ).toBe(true);
  expect(oldDestroy?.at).toBeLessThan(freshCreate?.at ?? 0);
  expect(
    events.filter(
      (event) =>
        event.phase === 'chunk' &&
        event.sessionId === oldId &&
        event.at > (oldDestroy?.at ?? 0),
    ),
  ).toEqual([]);
  expect(
    events.filter(
      (event) =>
        event.phase === 'chunk' &&
        event.sessionId === oldId &&
        event.at > (freshCreate?.at ?? 0),
    ),
  ).toEqual([]);
  expect(observed.active).toBe(0);
  expect(observed.sessions).toEqual({
    created: created.length,
    destroyed: created.length,
  });
  for (const session of created)
    expect(
      destroyed.filter((event) => event.sessionId === session.sessionId),
    ).toHaveLength(1);

  await page.evaluate(() => {
    (
      globalThis as unknown as { __nativeToolSourceBoundaryVerified: boolean }
    ).__nativeToolSourceBoundaryVerified = true;
  });
}

test('native Stop releases its session and permits a fresh lookup', async ({
  page,
}, info) => {
  await workflow(page, info, 'stop', async () => {
    await send(
      page,
      'Stop workflow: Do not call tools. Count from one to one hundred thousand in words, one number per line. Continue without abbreviating or summarizing.',
    );

    if (live)
      await expect
        .poll(async () =>
          (await evidence(page)).nativeEvents?.some((event) => {
            const part = event as { phase: string; value?: unknown };
            return part.phase === 'chunk' && typeof part.value === 'string';
          }),
        )
        .toBe(true);
    else await expect.poll(async () => (await evidence(page)).active).toBe(1);

    await page.getByTestId('stop').click();

    await expect(page.getByTestId('status')).toHaveText('idle');
    await expect.poll(async () => (await evidence(page)).active).toBe(0);
    await expect
      .poll(async () => {
        const sessions = (await evidence(page)).sessions;
        return !!sessions && sessions.created === sessions.destroyed;
      })
      .toBe(true);
    await expect(page.getByTestId('operation-count')).toHaveText('0');
    if (!live) expect((await evidence(page)).requests).toHaveLength(1);

    await send(page, prompts.lookup);

    await settled(page);
    if (live) await verifyNativeStopBoundary(page);
    await expect(page.getByTestId('operation-count')).toHaveText('1', {
      timeout: 1000,
    });
    await exactAnswer(page, (await operations(page))[0].token);
  });
});
