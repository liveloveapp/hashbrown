import {
  createUiJsonSchema,
  s,
  type UiComponentDefinition,
} from '@hashbrownai/core';

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

/** Trusted leaf contract independently matched against each framework fixture. */
const workflowStatusDefinition = {
  name: 'status',
  description: 'Display a runtime status.',
  props: {
    title: s.streaming.string('Status title'),
    count: s.number('Status count'),
  },
  children: false,
} satisfies UiComponentDefinition;

/** Container contract; only status components are allowed as children. */
const workflowPanelDefinition = {
  name: 'panel',
  description: 'Group a status inside a panel.',
  props: { heading: s.string('Panel heading') },
  children: [workflowStatusDefinition],
} satisfies UiComponentDefinition;

function tree(value: string, nested = false) {
  const status = (count: number) => ({
    status: { props: { title: value, count } },
  });
  return {
    ui: nested
      ? [
          {
            panel: {
              props: { heading: 'Workflow' },
              children: [status(1), status(2)],
            },
          },
        ]
      : [status(1)],
  };
}

/** Removes Skillet resolved-node wrappers while preserving the complete parsed UI tree. */
function resolvedTree(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(resolvedTree);
  if (!value || typeof value !== 'object') return value;
  const object = value as Record<string, unknown>;
  if ('complete' in object && 'partialValue' in object) {
    expect(object['complete']).toBe(true);
    expect(object).toHaveProperty('value');
    return resolvedTree(object['value']);
  }
  return Object.fromEntries(
    Object.entries(object).map(([key, value]) => [key, resolvedTree(value)]),
  );
}

/** Extracts prior assistant UI text rather than matching tool-result substrings. */
function replayAssistantTrees(replay: unknown): unknown[] {
  return (
    replay as {
      role: string;
      content: string | { type: string; value: unknown }[];
    }[]
  )
    .filter((message) => message.role === 'assistant')
    .map((message) =>
      typeof message.content === 'string'
        ? message.content
        : message.content
            .filter((part) => part.type === 'text')
            .map((part) => part.value)
            .join(''),
    )
    .filter((text) => text.trim().startsWith('{'))
    .map((text) => JSON.parse(text));
}

/** Extracts typed native call/result parts without flattening their IDs, arguments, or result text. */
function nativeToolParts(input: unknown): unknown[] {
  const prompts = input as {
    role: string;
    content: string | { type: string; value: Record<string, unknown> }[];
  }[];
  return prompts.flatMap((prompt) =>
    typeof prompt.content === 'string'
      ? []
      : prompt.content
          .filter(
            (part) =>
              part.type === 'tool-call' || part.type === 'tool-response',
          )
          .map((part) => ({
            role: prompt.role,
            type: part.type,
            callId: part.value['callID'] ?? part.value['callId'],
            name: part.value['name'],
            ...(part.type === 'tool-call'
              ? { arguments: part.value['arguments'] }
              : { result: part.value['result'] }),
          })),
  );
}

/** Builds the independent schema catalog expected for a bounded workflow. */
function expectedConstraint(scenario: Scenario) {
  return createUiJsonSchema({
    components:
      scenario === 'nested'
        ? [workflowStatusDefinition, workflowPanelDefinition]
        : [workflowStatusDefinition],
  });
}

/** Lists only the application tools required by this workflow. */
function expectedTools(scenario: Scenario): string[] {
  return scenario === 'no-tools'
    ? []
    : scenario === 'dependent' ||
        scenario === 'phase-out-of-phase' ||
        scenario === 'phase-replay'
      ? ['lookup_secret', 'follow_secret']
      : ['lookup_secret'];
}

/** Checks selected tool phases and terminal declarations retained solely for typed history. */
function expectedDeclarations(
  scenario: Scenario,
  observed: Awaited<ReturnType<typeof evidence>>,
): string[][] {
  if (!applicationPhases)
    return Array.from({ length: observed.sessions?.created ?? 0 }, () =>
      expectedTools(scenario),
    );
  if (live)
    return scenario === 'phase-replay'
      ? [
          ['lookup_secret'],
          ['follow_secret'],
          ['lookup_secret', 'follow_secret'],
          ['lookup_secret', 'follow_secret'],
        ]
      : scenario === 'no-tools'
        ? [[]]
        : scenario === 'dependent'
          ? [
              ['lookup_secret'],
              ['follow_secret'],
              ['lookup_secret', 'follow_secret'],
            ]
          : [['lookup_secret'], ['lookup_secret']];
  const requests = observed.requests as {
    response_format?: unknown;
    messages: {
      role: string;
      content: unknown;
      tool_calls?: { function: { name: string } }[];
    }[];
  }[];
  return requests.map((request) => {
    if (request.response_format) {
      const referenced = new Set(
        request.messages.flatMap((message) =>
          (message.tool_calls ?? []).map((call) => call.function.name),
        ),
      );
      return expectedTools(scenario).filter((name) => referenced.has(name));
    }
    const user = request.messages.findLastIndex(
      (message) =>
        message.role === 'user' &&
        /^(Call lookup_secret|Without calling tools)/.test(
          String(message.content),
        ),
    );
    const completed = request.messages
      .slice(user + 1)
      .filter((message) => message.role === 'tool').length;
    return [
      scenario === 'dependent' && completed === 1
        ? 'follow_secret'
        : 'lookup_secret',
    ];
  });
}

/** Counts actual model prompts without an extra model-led planning completion. */
function expectedRequestCount(scenario: Scenario): number {
  return scenario === 'no-tools'
    ? 1
    : scenario === 'dependent'
      ? applicationPhases
        ? 3
        : 4
      : applicationPhases
        ? 2
        : 3;
}

/** Records native create declarations after page initialization, without changing inference. */
async function observeDeclarations(page: Page): Promise<void> {
  await page.evaluate(() => {
    const runtime = globalThis as unknown as {
      LanguageModel: {
        create(options: Record<string, unknown>): Promise<unknown>;
      };
      __nativeUiDeclarations: { tools?: { name: string }[] }[];
    };
    runtime.__nativeUiDeclarations = [];
    const create = runtime.LanguageModel.create.bind(runtime.LanguageModel);
    runtime.LanguageModel.create = async (options) => {
      runtime.__nativeUiDeclarations.push(JSON.parse(JSON.stringify(options)));
      return create(options);
    };
  });
}

const live = process.env['LOCAL_LLM_NATIVE_TOOL_WORKFLOWS_LIVE'] === '1';
const applicationPhases =
  process.env['LOCAL_LLM_APPLICATION_TOOL_PHASES'] === '1';
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

type Scenario =
  | 'lookup'
  | 'dependent'
  | 'nested'
  | 'no-tools'
  | 'final-tool'
  | 'malformed'
  | 'disallowed'
  | 'invalid-props'
  | 'stop-planning'
  | 'stop-finalization'
  | 'stream'
  | 'phase-no-call'
  | 'phase-repeated-call'
  | 'phase-out-of-phase'
  | 'phase-replay'
  | 'phase-final-call-after-text';
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
  const lastUser = request.messages.findLastIndex(
    (message) =>
      message.role === 'user' &&
      /^(Call lookup_secret|Without calling tools)/.test(
        String(message.content),
      ),
  );
  const replay = String(request.messages[lastUser]?.content).startsWith(
    'Without calling tools',
  );
  const results = request.messages.filter(
    (message, index) => message.role === 'tool' && (replay || index > lastUser),
  );
  const finalizing = !!(request as unknown as { response_format?: unknown })
    .response_format;
  if (finalizing) {
    if (scenario === 'final-tool')
      return call('forbidden', 'lookup_secret', { record: 'beta' });
    if (scenario === 'malformed') return { content: 'THIS_IS_NOT_JSON' };
    if (scenario === 'disallowed')
      return {
        content: JSON.stringify({ ui: [{ untrusted: { props: {} } }] }),
      };
    if (scenario === 'invalid-props')
      return {
        content: JSON.stringify({
          ui: [{ status: { props: { title: 'bad', count: 'invalid' } } }],
        }),
      };
    const result = JSON.parse(String(results.at(-1)?.content ?? '{}')) as {
      token?: string;
      receipt?: string;
    };
    if (scenario === 'phase-final-call-after-text') {
      if (typeof result.token !== 'string')
        throw new Error('Rollback response requires the actual lookup result.');
      return {
        content: JSON.stringify(tree(result.token)),
        toolCalls: [
          {
            id: 'forbidden-after-ui',
            name: 'lookup_secret',
            arguments: JSON.stringify({ record: 'beta' }),
          },
        ],
      };
    }
    return {
      content: JSON.stringify(
        tree(
          result.receipt ?? result.token ?? 'NO_TOOLS',
          scenario === 'nested',
        ),
      ),
    };
  }
  if (applicationPhases && !results.length) {
    if (scenario === 'phase-no-call')
      return { content: 'PRIVATE_PLANNING_PROSE' };
    if (scenario === 'phase-out-of-phase')
      return call('wrong-phase', 'follow_secret', { token: 'untrusted' });
    if (scenario === 'phase-repeated-call')
      return {
        content: 'PRIVATE_PLANNING_PROSE',
        toolCalls: [
          {
            id: 'repeat-a',
            name: 'lookup_secret',
            arguments: JSON.stringify({ record: 'alpha' }),
          },
          {
            id: 'repeat-b',
            name: 'lookup_secret',
            arguments: JSON.stringify({ record: 'alpha' }),
          },
        ],
      };
  }
  if (!results.length && scenario !== 'no-tools')
    return call(`lookup-${lastUser}`, 'lookup_secret', { record: 'alpha' });
  if (scenario === 'dependent' && results.length === 1) {
    const result = JSON.parse(String(results[0].content)) as { token: string };
    return call(`follow-${lastUser}`, 'follow_secret', { token: result.token });
  }
  return { content: 'PRIVATE_PLANNING_PROSE' };
}
/** Retains raw native prompts/chunks and transport lifecycle for every result. */
async function evidence(page: Page) {
  return page.evaluate(() => {
    const runtime = globalThis as unknown as {
      __nativeUiDeclarations?: { tools?: { name: string }[] }[];
      __nativeToolNativeEvents?: unknown[];
      __nativeToolRequests?: unknown[];
      __nativeToolCanonical?: unknown[];
      __nativeToolActive?: () => number;
      __hashbrownNativeTools?: { created: number; destroyed: number };
    };
    return {
      declarations: runtime.__nativeUiDeclarations,
      events: runtime.__nativeToolNativeEvents,
      requests: runtime.__nativeToolRequests,
      canonical: runtime.__nativeToolCanonical,
      active: runtime.__nativeToolActive?.(),
      sessions: runtime.__hashbrownNativeTools,
    };
  });
}
/** Runs an opt-in component UI workflow without allowing downloads or HTTP fallback. */
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
        latency: scenario === 'stop-planning' ? 50 : 1,
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
    if (mock)
      await installNativeToolShim(
        page,
        mock.url,
        true,
        scenario === 'stream' ||
          scenario === 'stop-finalization' ||
          scenario === 'phase-final-call-after-text'
          ? '","'
          : undefined,
      );
    else await installNativeToolObserver(page);
    await page.goto(
      `/?localUiWorkflow=true&localModel=${applicationPhases ? 'chrome-tools-phases' : 'chrome-tools-schema'}&runUrl=` +
        encodeURIComponent('http://127.0.0.1:1/unused') +
        `&sample=${Date.now()}` +
        `&uiWorkflow=${scenario === 'phase-out-of-phase' || scenario === 'phase-replay' ? 'dependent' : scenario === 'dependent' || scenario === 'nested' || scenario === 'no-tools' ? scenario : 'lookup'}`,
    );
    await observeDeclarations(page);
    await run();
    const observed = await evidence(page);
    expect(observed.declarations?.length).toBeGreaterThan(0);
    expect(
      observed.declarations?.map((declaration) =>
        (declaration.tools ?? []).map((tool) => tool.name),
      ),
    ).toEqual(expectedDeclarations(scenario, observed));
    if (!live) {
      const requests = observed.requests as {
        response_format?: { json_schema: { schema: object } };
      }[];
      for (const request of requests) {
        if (request.response_format)
          expect(request.response_format.json_schema.schema).toEqual(
            expectedConstraint(scenario),
          );
      }
    }
    if (applicationPhases) {
      const history = await page.getByTestId('history').innerText();
      expect(history).not.toContain('The application selected');
      expect(history).not.toContain('The application has completed');
    }
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
    await info.attach('native-ui-evidence.json', {
      contentType: 'application/json',
      body: JSON.stringify(
        {
          live,
          applicationPhases,
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
async function send(
  page: Page,
  dependent = false,
  scenario: Scenario = 'lookup',
) {
  await page
    .getByTestId('prompt')
    .fill(
      scenario === 'no-tools'
        ? 'Without calling tools, render exactly one top-level status with title NO_TOOLS and count 1. Do not include a panel or other components.'
        : `${dependent ? 'Call lookup_secret for alpha then follow_secret with the exact token. Use the receipt' : 'Call lookup_secret for alpha exactly once. Use the token'} as the exact status title and count 1. ${scenario === 'nested' ? 'Render a panel heading Workflow containing two status children with that same title and counts 1 and 2.' : 'Render exactly one top-level status, with no panel and no other components.'}`,
    );
  await page.getByTestId('send').click();
}

for (const scenario of ['lookup', 'dependent', 'nested', 'no-tools'] as const) {
  test(
    scenario === 'no-tools'
      ? 'native UI no-tools constrains the direct component answer'
      : `native UI ${scenario} consumes exact tool results after unconstrained planning`,
    async ({ page }, info) => {
      await workflow(page, info, scenario, async () => {
        await send(page, scenario === 'dependent', scenario);

        await expect(page.getByTestId('operation-count')).toHaveText(
          scenario === 'dependent' ? '2' : scenario === 'no-tools' ? '0' : '1',
        );
        await expect(page.getByTestId('status')).toHaveText('idle');
        expect(await page.getByTestId('error').innerText()).toBe('');
        const operations = JSON.parse(
          await page.getByTestId('operations').innerText(),
        ) as {
          name: string;
          record?: string;
          token: string;
          receipt?: string;
        }[];
        if (scenario !== 'no-tools')
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
        } else if (scenario === 'no-tools') {
          value = 'NO_TOOLS';
        } else {
          expect(operations.map((operation) => operation.name)).toEqual([
            'lookup_secret',
          ]);
          value = operations[0].token;
        }
        await expect(page.getByTestId('ui-value')).toHaveText(
          scenario === 'nested' ? [value, value] : [value],
        );
        await expect(page.getByTestId('ui-count')).toHaveText(
          scenario === 'nested' ? ['1', '2'] : ['1'],
        );
        if (scenario === 'nested')
          await expect(page.getByTestId('ui-panel')).toContainText('Workflow');
        const history = await page.getByTestId('history').innerText();
        const messages = JSON.parse(history) as {
          role: string;
          content: unknown;
        }[];
        expect(
          resolvedTree(
            messages.findLast((message) => message.role === 'assistant')
              ?.content,
          ),
        ).toEqual(tree(value, scenario === 'nested'));
        expect(history).not.toContain('PRIVATE_PLANNING_PROSE');
        expect(history).not.toContain('Return the final answer');
        if (applicationPhases) {
          expect(history).not.toContain('The application selected');
          expect(history).not.toContain('The application has completed');
        }
        const observed = await evidence(page);
        expect(
          observed.declarations?.map((declaration) =>
            (declaration.tools ?? []).map((tool) => tool.name),
          ),
        ).toEqual(expectedDeclarations(scenario, observed));
        if (!live) {
          const requests = observed.requests as {
            response_format?: { json_schema: { schema: object } };
            messages: { role: string; content: unknown }[];
          }[];
          expect(requests).toHaveLength(expectedRequestCount(scenario));
          expect(
            requests.slice(0, -1).every((request) => !request.response_format),
          ).toBe(true);
          expect(requests.at(-1)?.response_format?.json_schema.schema).toEqual(
            expectedConstraint(scenario),
          );
          expect(observed.sessions?.created).toBe(
            scenario === 'dependent' ? 3 : scenario === 'no-tools' ? 1 : 2,
          );
          await page
            .getByTestId('prompt')
            .fill(
              'Without calling tools, render the previous exact status title and count 1.',
            );
          await page.getByTestId('send').click();
          await expect
            .poll(async () => ((await evidence(page)).requests ?? []).length)
            .toBe(
              requests.length +
                (applicationPhases || scenario === 'no-tools' ? 1 : 2),
            );
          await expect(page.getByTestId('status')).toHaveText('idle');
          await expect(page.getByTestId('error')).toBeEmpty();
          await expect(page.getByTestId('ui-value').last()).toHaveText(value);
          await expect(page.getByTestId('operation-count')).toHaveText(
            scenario === 'dependent'
              ? '2'
              : scenario === 'no-tools'
                ? '0'
                : '1',
          );
          const replay = ((await evidence(page)).canonical as unknown[][])[
            requests.length
          ];
          if (applicationPhases) {
            const assistants = (replay as { role: string }[]).filter(
              (message) => message.role === 'assistant',
            );
            expect(JSON.stringify(assistants)).not.toContain(
              'The application selected',
            );
            expect(JSON.stringify(assistants)).not.toContain(
              'The application has completed',
            );
          }
          expect(replayAssistantTrees(replay)).toEqual([
            tree(value, scenario === 'nested'),
          ]);
          expect(JSON.stringify(replay)).not.toContain(
            'PRIVATE_PLANNING_PROSE',
          );
          expect(JSON.stringify(replay)).not.toContain(
            'Return the final answer',
          );
        } else {
          const events = observed.events as {
            phase: string;
            options?: { responseConstraint?: object };
            value?: unknown;
          }[];
          const prompts = events.filter((event) => event.phase === 'prompt');
          expect(prompts).toHaveLength(expectedRequestCount(scenario));
          expect(
            prompts
              .slice(0, -1)
              .every(
                (event) => event.options?.responseConstraint === undefined,
              ),
          ).toBe(true);
          const final = events.findLastIndex(
            (event) => event.phase === 'prompt',
          );
          expect(events[final].options?.responseConstraint).toEqual(
            expectedConstraint(scenario),
          );
          const text = events
            .slice(final + 1)
            .filter(
              (event) =>
                event.phase === 'chunk' && typeof event.value === 'string',
            )
            .map((event) => event.value)
            .join('');
          expect(JSON.parse(text)).toEqual(tree(value, scenario === 'nested'));
        }
      });
    },
  );
}

if (applicationPhases && live) {
  test('native UI application tool phases replay a subsequent user turn with typed prior results', async ({
    page,
  }, info) => {
    await workflow(page, info, 'phase-replay', async () => {
      await send(page, true, 'phase-replay');

      await expect(page.getByTestId('operation-count')).toHaveText('2');
      await expect(page.getByTestId('status')).toHaveText('idle');
      await expect(page.getByTestId('error')).toBeEmpty();
      const operations = JSON.parse(
        await page.getByTestId('operations').innerText(),
      ) as { name: string; record?: string; token: string; receipt?: string }[];
      expect(operations.map((operation) => operation.name)).toEqual([
        'lookup_secret',
        'follow_secret',
      ]);
      expect(operations[0].record).toBe('alpha');
      expect(operations[1].token).toBe(operations[0].token);
      const receipt = operations[1].receipt;
      if (typeof receipt !== 'string')
        throw new Error('Dependent handler did not return a receipt.');
      expect(receipt).toMatch(/^HB_RECEIPT_/);
      await expect(page.getByTestId('ui-value')).toHaveText([receipt]);
      await expect(page.getByTestId('ui-count')).toHaveText(['1']);

      await page
        .getByTestId('prompt')
        .fill(
          'Without calling tools, render exactly one top-level status with the previous exact status title and count 1.',
        );
      await page.getByTestId('send').click();

      await expect(page.getByTestId('ui-value')).toHaveText([receipt, receipt]);
      await expect(page.getByTestId('ui-count')).toHaveText(['1', '1']);
      await expect(page.getByTestId('ui-leaf')).toHaveCount(2);
      await expect(page.getByTestId('ui-fallback')).toHaveCount(0);
      await expect(page.getByTestId('status')).toHaveText('idle');
      await expect(page.getByTestId('error')).toBeEmpty();
      await expect(page.getByTestId('operation-count')).toHaveText('2');
      expect(
        JSON.parse(await page.getByTestId('operations').innerText()),
      ).toEqual(operations);
      const history = JSON.parse(
        await page.getByTestId('history').innerText(),
      ) as {
        role: string;
        content: unknown;
        toolCalls?: { toolCallId: string; name: string; args: object }[];
      }[];
      const assistantTrees = history
        .filter(
          (message) =>
            message.role === 'assistant' &&
            typeof message.content === 'object' &&
            message.content !== null &&
            'ui' in message.content,
        )
        .map((message) => resolvedTree(message.content));
      expect(assistantTrees).toEqual([tree(receipt), tree(receipt)]);
      const observed = await evidence(page);
      expect(
        observed.declarations?.map((declaration) =>
          (declaration.tools ?? []).map((tool) => tool.name),
        ),
      ).toEqual([
        ['lookup_secret'],
        ['follow_secret'],
        ['lookup_secret', 'follow_secret'],
        ['lookup_secret', 'follow_secret'],
      ]);
      const events = observed.events as {
        phase: string;
        input?: unknown;
        options?: { responseConstraint?: object };
        value?: unknown;
      }[];
      const prompts = events.filter((event) => event.phase === 'prompt');
      expect(prompts).toHaveLength(4);
      expect(
        prompts.map((prompt) => prompt.options?.responseConstraint),
      ).toEqual([
        undefined,
        undefined,
        expectedConstraint('phase-replay'),
        expectedConstraint('phase-replay'),
      ]);
      const calls = history.flatMap((message) =>
        message.role === 'assistant' ? (message.toolCalls ?? []) : [],
      );
      expect(calls.map((call) => call.name)).toEqual([
        'lookup_secret',
        'follow_secret',
      ]);
      expect(calls[0].toolCallId).not.toBe('');
      expect(calls[1].toolCallId).not.toBe('');
      expect(calls[1].toolCallId).not.toBe(calls[0].toolCallId);
      const expectedParts = [
        {
          role: 'assistant',
          type: 'tool-call',
          callId: calls[0].toolCallId,
          name: 'lookup_secret',
          arguments: { record: 'alpha' },
        },
        {
          role: 'user',
          type: 'tool-response',
          callId: calls[0].toolCallId,
          name: 'lookup_secret',
          result: [
            {
              type: 'text',
              value: JSON.stringify({
                record: 'alpha',
                token: operations[0].token,
              }),
            },
          ],
        },
        {
          role: 'assistant',
          type: 'tool-call',
          callId: calls[1].toolCallId,
          name: 'follow_secret',
          arguments: { token: operations[0].token },
        },
        {
          role: 'user',
          type: 'tool-response',
          callId: calls[1].toolCallId,
          name: 'follow_secret',
          result: [{ type: 'text', value: JSON.stringify({ receipt }) }],
        },
      ];
      expect(nativeToolParts(prompts[2].input)).toEqual(expectedParts);
      expect(nativeToolParts(prompts[3].input)).toEqual(expectedParts);
      const firstFinal = events.indexOf(prompts[2]);
      const nextPrompt = events.indexOf(prompts[3]);
      const firstText = events
        .slice(firstFinal + 1, nextPrompt)
        .filter(
          (event) => event.phase === 'chunk' && typeof event.value === 'string',
        )
        .map((event) => event.value)
        .join('');
      expect(JSON.parse(firstText)).toEqual(tree(receipt));
      expect(replayAssistantTrees(prompts[3].input)).toEqual([tree(receipt)]);
      const final = events.findLastIndex((event) => event.phase === 'prompt');
      const text = events
        .slice(final + 1)
        .filter(
          (event) => event.phase === 'chunk' && typeof event.value === 'string',
        )
        .map((event) => event.value)
        .join('');
      expect(JSON.parse(text)).toEqual(tree(receipt));
    });
  });
}

if (!live) {
  test('native UI streams fallback before completion through a held final response', async ({
    page,
  }, info) => {
    await workflow(page, info, 'stream', async () => {
      await send(page);

      await expect(page.getByTestId('ui-fallback')).toHaveText(/^HB_alpha_/);
      await expect(page.getByTestId('status')).toHaveText('loading');
      await expect(page.getByTestId('ui-value')).toHaveCount(0);
      const operations = JSON.parse(
        await page.getByTestId('operations').innerText(),
      ) as { token: string }[];
      await expect(page.getByTestId('ui-fallback')).toHaveText(
        operations[0].token,
      );
      await page.evaluate(() =>
        (
          globalThis as unknown as {
            __nativeToolReleaseFinal: () => void;
          }
        ).__nativeToolReleaseFinal(),
      );

      await expect(page.getByTestId('ui-value')).toHaveText(
        operations[0].token,
      );
      await expect(page.getByTestId('status')).toHaveText('idle');
      await expect(page.getByTestId('error')).toBeEmpty();
    });
  });

  if (applicationPhases) {
    test('native UI application finalization rolls back valid partial UI before a forbidden tool call', async ({
      page,
    }, info) => {
      await workflow(page, info, 'phase-final-call-after-text', async () => {
        await send(page);

        await expect(page.getByTestId('ui-fallback')).toHaveText(/^HB_alpha_/);
        const operations = JSON.parse(
          await page.getByTestId('operations').innerText(),
        ) as { token: string }[];
        await expect(page.getByTestId('ui-fallback')).toHaveText(
          operations[0].token,
        );
        await expect(page.getByTestId('status')).toHaveText('loading');
        await expect(page.getByTestId('ui-leaf')).toHaveCount(0);
        await page.evaluate(() =>
          (
            globalThis as unknown as { __nativeToolReleaseFinal: () => void }
          ).__nativeToolReleaseFinal(),
        );

        await expect(page.getByTestId('error')).not.toBeEmpty();
        await expect(page.getByTestId('status')).toHaveText('idle');
        await expect(page.getByTestId('operation-count')).toHaveText('1');
        expect(
          JSON.parse(await page.getByTestId('operations').innerText()),
        ).toEqual(operations);
        await expect(page.getByTestId('ui-leaf')).toHaveCount(0);
        await expect(page.getByTestId('ui-fallback')).toHaveCount(0);
        const observed = await evidence(page);
        expect(observed.requests).toHaveLength(2);
      });
    });
  }

  if (applicationPhases) {
    for (const scenario of [
      'phase-no-call',
      'phase-repeated-call',
      'phase-out-of-phase',
    ] as const) {
      test(`native UI application tool phase rejects ${scenario} atomically`, async ({
        page,
      }, info) => {
        await workflow(page, info, scenario, async () => {
          await send(page);

          await expect(page.getByTestId('error')).not.toBeEmpty();
          await expect(page.getByTestId('status')).toHaveText('idle');
          await expect(page.getByTestId('operation-count')).toHaveText('0');
          await expect(page.getByTestId('ui-leaf')).toHaveCount(0);
          await expect(page.getByTestId('ui-fallback')).toHaveCount(0);
          const observed = await evidence(page);
          expect(observed.requests).toHaveLength(1);
          expect(
            (observed.requests as { response_format?: unknown }[])[0]
              .response_format,
          ).toBeUndefined();
          const history = await page.getByTestId('history').innerText();
          expect(history).not.toContain('PRIVATE_PLANNING_PROSE');
          const messages = JSON.parse(history) as {
            role: string;
            toolCalls?: unknown[];
          }[];
          expect(
            messages.flatMap((message) =>
              message.role === 'assistant' ? (message.toolCalls ?? []) : [],
            ),
          ).toEqual([]);
        });
      });
    }
  }

  for (const scenario of [
    'final-tool',
    'malformed',
    'disallowed',
    'invalid-props',
  ] as const) {
    test(`native UI rejects ${scenario} without additional side effects`, async ({
      page,
    }, info) => {
      await workflow(page, info, scenario, async () => {
        await send(page);

        await expect
          .poll(async () => ((await evidence(page)).requests ?? []).length)
          .toBe(applicationPhases ? 2 : 3);
        if (scenario === 'final-tool' || scenario === 'malformed') {
          await expect(page.getByTestId('error')).not.toBeEmpty();
        }
        await expect(page.getByTestId('status')).toHaveText('idle');
        await expect(page.getByTestId('operation-count')).toHaveText('1');
        await expect(page.getByTestId('ui-value')).toHaveCount(0);
        await expect(page.getByTestId('ui-leaf')).toHaveCount(0);
        await expect(page.locator('untrusted')).toHaveCount(0);
        if (scenario === 'disallowed' || scenario === 'invalid-props') {
          const history = JSON.parse(
            await page.getByTestId('history').innerText(),
          ) as { role: string; content: unknown }[];
          const answer = history.findLast(
            (message) => message.role === 'assistant',
          )?.content;
          expect(answer).toEqual(
            scenario === 'disallowed'
              ? { ui: [] }
              : {
                  ui: [
                    {
                      status: {
                        props: {
                          complete: true,
                          partialValue: { title: 'bad', count: 'invalid' },
                        },
                      },
                    },
                  ],
                },
          );
          await expect(page.getByTestId('error')).toBeEmpty();
          if (scenario === 'invalid-props')
            await expect(page.getByTestId('ui-fallback')).toHaveText('bad');
        }
      });
    });
  }
  for (const phase of ['planning', 'finalization'] as const)
    test(`native UI Stop during ${phase} removes canceled UI and recovers exactly`, async ({
      page,
    }, info) => {
      await workflow(page, info, `stop-${phase}`, async () => {
        await send(page);
        let oldToken: string | undefined;
        if (phase === 'finalization') {
          await expect(page.getByTestId('ui-fallback')).toHaveText(
            /^HB_alpha_/,
          );
          oldToken = await page.getByTestId('ui-fallback').innerText();
          await expect(page.getByTestId('status')).toHaveText('loading');
          await expect(page.getByTestId('ui-leaf')).toHaveCount(0);
        } else {
          await expect
            .poll(async () => ((await evidence(page)).requests ?? []).length)
            .toBe(1);
          await expect(page.getByTestId('operation-count')).toHaveText('0');
        }

        await page.getByTestId('stop').click();

        await expect(page.getByTestId('status')).toHaveText('idle');
        await expect.poll(async () => (await evidence(page)).active).toBe(0);
        await expect(page.getByTestId('ui-fallback')).toHaveCount(0);
        await expect(page.getByTestId('ui-leaf')).toHaveCount(0);
        await expect(page.getByTestId('operation-count')).toHaveText(
          phase === 'planning' ? '0' : '1',
        );

        await send(page);

        await expect(page.getByTestId('operation-count')).toHaveText(
          phase === 'planning' ? '1' : '2',
        );
        await expect(page.getByTestId('status')).toHaveText('idle');
        expect(await page.getByTestId('error').innerText()).toBe('');
        const operations = JSON.parse(
          await page.getByTestId('operations').innerText(),
        ) as { token: string }[];
        const recoveredToken = operations.at(-1)?.token;
        expect(recoveredToken).toMatch(/^HB_alpha_/);
        if (oldToken) expect(recoveredToken).not.toBe(oldToken);
        await expect(page.getByTestId('ui-leaf')).toHaveCount(1);
        await expect(page.getByTestId('ui-value')).toHaveText(
          recoveredToken ?? 'MISSING_HANDLER_RESULT',
        );
        await expect(page.getByTestId('ui-count')).toHaveText('1');
        await expect(page.getByTestId('ui-fallback')).toHaveCount(0);
        if (oldToken)
          await expect(page.getByTestId('ui-leaf')).not.toContainText(oldToken);
      });
    });
}
