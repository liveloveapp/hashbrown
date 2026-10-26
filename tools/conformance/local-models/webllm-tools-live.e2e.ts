import {
  test as base,
  expect,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import type { WebLlmChunk } from '@hashbrownai/core';
import { requireWebLlmToolsLive } from '../harness/webllm-tools-live-mode';
import {
  installWebLlmWorker,
  readBrowserMemory,
  startWebLlmRuntime,
} from './webllm-runtime';

const selection = requireWebLlmToolsLive(process.env);
const test = base.extend({
  context: async ({ playwright, baseURL, launchOptions }, use) => {
    // --list never executes this fixture or opens its dedicated model-cache profile.
    const context = await playwright.chromium.launchPersistentContext(
      selection.profile,
      {
        ...launchOptions,
        channel: 'chrome',
        headless: false,
        baseURL,
      },
    );
    try {
      await use(context);
    } finally {
      await context.close();
    }
  },
});

type Request = {
  messages: { role: string; content: string }[];
  response_format: { type: string; schema: string };
  tools?: unknown;
  max_tokens: number;
  temperature: number;
  seed: number;
};
type Evidence = {
  request: Request;
  responseText: string;
  chunks: WebLlmChunk[];
};
type Completed = {
  callId: string;
  name: string;
  arguments: object;
  result: { type: string; text: string };
};
type CanonicalMessage = {
  role: string;
  content?: unknown;
  toolCallId?: string;
  toolCalls?: {
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }[];
};
type Replay = {
  contexts: {
    threadId: string;
    userMessage: { id: string; content: string };
    completedCalls: Completed[];
    frozen: boolean;
  }[];
  canonical: { messages: CanonicalMessage[] }[];
  events: { type: string; toolCallId?: string; toolCallName?: string }[];
  disposed: number;
};
type Metrics = {
  loadError?: string;
  loadedEngines: number;
  activeRequests: number;
  unloaded?: boolean;
  workerTerminated?: boolean;
  workerUrlRevoked?: boolean;
  requests: { finishReason?: string; drained?: boolean }[];
};
type RuntimeState = {
  __localWebLlmReady?: boolean;
  __localWebLlmMetrics: Metrics;
  __localWebLlmToolsEvidence: Evidence[];
  __localWebLlmDispose?(): Promise<void>;
  __webLlmToolContexts?: Replay['contexts'];
  __webLlmToolCanonical?: Replay['canonical'];
  __webLlmToolEvents?: Replay['events'];
  __webLlmToolDisposed?: number;
};
type Operation = {
  name: string;
  record?: string;
  token: string;
  receipt?: string;
};
type Envelope = {
  type: string;
  protocol: number;
  callId: string;
  name: string;
  arguments?: object;
  text?: string;
  status?: string;
};

/** Reads independent canonical runtime observations, including disposed responses. */
async function readReplay(page: Page): Promise<Replay> {
  return page.evaluate(() => {
    const state = globalThis as unknown as RuntimeState;
    return {
      contexts: state.__webLlmToolContexts ?? [],
      canonical: state.__webLlmToolCanonical ?? [],
      events: state.__webLlmToolEvents ?? [],
      disposed: state.__webLlmToolDisposed ?? 0,
    };
  });
}

/** Extracts projected call/result envelopes from engine-facing text messages. */
function envelopes(request: Request): Envelope[] {
  return request.messages.flatMap(({ content }) => {
    try {
      const value = JSON.parse(content) as Envelope;
      return value.type?.startsWith('hashbrown.tool_') ? [value] : [];
    } catch {
      return [];
    }
  });
}

/** Persists attachments as files on successful and failed runs, independently of reporter display. */
async function attachJson(
  info: TestInfo,
  name: string,
  value: unknown,
): Promise<void> {
  const path = info.outputPath(name + '.json');
  await writeFile(path, JSON.stringify(value ?? null, null, 2));
  await info.attach(name, { path, contentType: 'application/json' });
}

for (const scenario of [
  'lookup-schema',
  'dependent-schema',
  'lookup-status',
] as const) {
  test(`real WebLLM structured tools ${scenario}`, async ({ page }, info) => {
    const dependent = scenario === 'dependent-schema';
    const ui = scenario === 'lookup-status';
    const requestCount = dependent ? 3 : 2;
    const errors: string[] = [];
    const forbidden: string[] = [];
    const cleanupErrors: string[] = [];
    let primary: unknown;
    let runtime: Awaited<ReturnType<typeof startWebLlmRuntime>> | undefined;
    let operations: Operation[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/forbidden-tools-live-fallback')
        forbidden.push(request.url());
    });
    try {
      runtime = await startWebLlmRuntime(selection.modulePath);
      await installWebLlmWorker(page, runtime.url, selection.model, {
        toolsEvidence: true,
      });
      await page.goto(
        '/?' +
          new URLSearchParams({
            localModel: 'webllm-tools',
            [ui ? 'localUiWorkflow' : 'localSchemaWorkflow']: 'true',
            uiWorkflow: dependent ? 'dependent' : 'lookup',
            runUrl: 'http://127.0.0.1:1/forbidden-tools-live-fallback',
          }),
      );
      await page.waitForFunction(
        () => {
          const state = globalThis as unknown as RuntimeState;
          return (
            state.__localWebLlmReady || state.__localWebLlmMetrics.loadError
          );
        },
        undefined,
        { timeout: 1_200_000 },
      );
      expect(
        await page.evaluate(
          () =>
            (globalThis as unknown as RuntimeState).__localWebLlmMetrics
              .loadError,
        ),
      ).toBeUndefined();
      expect(
        JSON.parse(await page.getByTestId('operations').innerText()),
      ).toEqual([]);
      const prompt = dependent
        ? 'Call lookup_secret with record alpha, then call follow_secret using the exact lookup token. Return the exact receipt in value.'
        : ui
          ? 'Call lookup_secret exactly once with record alpha. Render exactly one status with its exact token as title and count 7.'
          : 'Call lookup_secret exactly once with record alpha. Return the exact token in value.';
      await page.getByTestId('prompt').fill(prompt);
      await page.getByTestId('send').click();
      await page.waitForFunction(
        (outputId) =>
          !!document.querySelector('[data-testid="error"]')?.textContent ||
          !!document.querySelector(`[data-testid="${outputId}"]`)?.textContent,
        ui ? 'ui-value' : 'assistant',
        { timeout: 180_000 },
      );
      await expect(page.getByTestId('error')).toBeEmpty();
      await expect(
        page.getByTestId(ui ? 'ui-value' : 'assistant'),
      ).not.toBeEmpty();
      await expect(page.getByTestId('status')).toHaveText('idle', {
        timeout: 180_000,
      });
      await expect(page.getByTestId('error')).toBeEmpty();
      await expect
        .poll(async () => (await readReplay(page)).disposed, {
          timeout: 30_000,
        })
        .toBe(requestCount);
      const { metrics, evidence } = await page.evaluate(() => {
        const state = globalThis as unknown as RuntimeState;
        return {
          metrics: state.__localWebLlmMetrics,
          evidence: state.__localWebLlmToolsEvidence,
        };
      });
      operations = JSON.parse(
        await page.getByTestId('operations').innerText(),
      ) as Operation[];
      expect(operations).toHaveLength(dependent ? 2 : 1);
      expect(operations[0]).toEqual({
        name: 'lookup_secret',
        record: 'alpha',
        token: operations[0].token,
      });
      expect(operations[0].token).toMatch(/^HB_alpha_[0-9a-f-]{36}$/);
      if (dependent) {
        expect(operations[1]).toEqual({
          name: 'follow_secret',
          token: operations[0].token,
          receipt: operations[1].receipt,
        });
        expect(operations[1].receipt).toMatch(/^HB_RECEIPT_[0-9a-f-]{36}$/);
      }
      const value = dependent ? operations[1].receipt : operations[0].token;
      if (!value) throw new Error('Missing actual handler token or receipt.');
      expect(metrics.loadedEngines).toBe(1);
      expect(metrics.activeRequests).toBe(0);
      expect(metrics.requests).toHaveLength(requestCount);
      expect(evidence).toHaveLength(requestCount);
      const replay = await readReplay(page);
      const completed = replay.contexts.at(-1)?.completedCalls ?? [];
      expect(
        replay.contexts.map((context) => context.completedCalls.length),
      ).toEqual(dependent ? [0, 1, 2] : [0, 1]);
      expect(
        replay.contexts.every(
          (context) =>
            context.frozen &&
            context.threadId === replay.contexts[0].threadId &&
            context.userMessage.id === replay.contexts[0].userMessage.id &&
            context.userMessage.content === prompt,
        ),
      ).toBe(true);
      expect(replay.canonical).toHaveLength(requestCount);
      const initialSystem = replay.canonical[0].messages
        .filter(
          (message) =>
            message.role === 'system' || message.role === 'developer',
        )
        .map((message) => message.content)
        .join('\n\n');
      expect(initialSystem).toContain(
        ui ? 'Call only declared tools' : 'Follow the requested workflow.',
      );
      for (const secret of [operations[0].token, operations[1]?.receipt].filter(
        Boolean,
      )) {
        expect(JSON.stringify(evidence[0].request)).not.toContain(secret);
        expect(prompt).not.toContain(secret);
      }
      for (const [index, raw] of evidence.entries()) {
        expect(metrics.requests[index]).toMatchObject({
          finishReason: 'stop',
          drained: true,
        });
        expect(
          raw.chunks.flatMap((chunk) =>
            chunk.choices.map((choice) => choice.finish_reason).filter(Boolean),
          ),
        ).toEqual(['stop']);
        expect(
          raw.chunks
            .map((chunk) => chunk.choices[0]?.delta.content ?? '')
            .join(''),
        ).toBe(raw.responseText);
        expect(raw.request.tools).toBeUndefined();
        expect(raw.request).toMatchObject({
          stream: true,
          temperature: 0,
          seed: 1,
          max_tokens: Number(process.env['WEBLLM_MAX_TOKENS'] ?? 256),
        });
        expect(raw.request.response_format.type).toBe('json_object');
        expect(
          raw.request.messages.every(
            (message) => typeof message.content === 'string',
          ),
        ).toBe(true);
        expect(raw.request.messages[0]).toMatchObject({ role: 'system' });
        expect(raw.request.messages[0].content).toContain(initialSystem);
        expect(JSON.parse(raw.request.response_format.schema).type).toBe(
          'object',
        );
        expect(envelopes(raw.request)).toHaveLength(index * 2);
        if (index < requestCount - 1)
          expect(JSON.parse(raw.responseText)).toEqual(
            index === 0 ? { record: 'alpha' } : { token: operations[0].token },
          );
      }
      const finalEvidence = evidence.at(-1);
      const finalCanonical = replay.canonical.at(-1);
      if (!finalEvidence || !finalCanonical)
        throw new Error('Missing final engine evidence or canonical input.');
      const projected = envelopes(finalEvidence.request);
      for (const [index, raw] of evidence.entries()) {
        expect(envelopes(raw.request)).toEqual(projected.slice(0, index * 2));
        expect(replay.contexts[index].completedCalls).toEqual(
          completed.slice(0, index),
        );
      }
      const canonical = finalCanonical.messages;
      const calls = canonical.flatMap((message) =>
        message.role === 'assistant' ? (message.toolCalls ?? []) : [],
      );
      const results = canonical.filter((message) => message.role === 'tool');
      expect(calls).toHaveLength(operations.length);
      expect(results).toHaveLength(operations.length);
      expect(completed).toHaveLength(operations.length);
      for (const [index, operation] of operations.entries()) {
        const args =
          index === 0 ? { record: 'alpha' } : { token: operations[0].token };
        const result =
          index === 0
            ? { record: 'alpha', token: operation.token }
            : { receipt: operation.receipt };
        const call = projected[index * 2];
        expect(call).toEqual({
          type: 'hashbrown.tool_call',
          protocol: 1,
          callId: completed[index].callId,
          name: operation.name,
          arguments: args,
        });
        expect(projected[index * 2 + 1]).toEqual({
          type: 'hashbrown.tool_result',
          protocol: 1,
          callId: call.callId,
          name: operation.name,
          status: 'success',
          text: JSON.stringify(result),
        });
        expect(calls[index]).toEqual({
          id: call.callId,
          type: 'function',
          function: { name: operation.name, arguments: JSON.stringify(args) },
        });
        expect(results[index]).toMatchObject({
          toolCallId: call.callId,
          content: JSON.stringify(result),
        });
        expect(completed[index]).toEqual({
          callId: call.callId,
          name: operation.name,
          arguments: args,
          result: { type: 'success', text: JSON.stringify(result) },
        });
      }
      expect(new Set(completed.map((call) => call.callId)).size).toBe(
        operations.length,
      );
      expect(
        replay.events
          .filter((event) => event.type === 'TOOL_CALL_START')
          .map((event) => ({ id: event.toolCallId, name: event.toolCallName })),
      ).toEqual(
        completed.map((call) => ({ id: call.callId, name: call.name })),
      );
      expect(
        replay.events.filter((event) => event.type === 'RUN_FINISHED'),
      ).toHaveLength(requestCount);
      expect(
        JSON.parse(finalEvidence.request.response_format.schema),
      ).toHaveProperty('properties.' + (ui ? 'ui' : 'value'));
      const expected = ui
        ? { ui: [{ status: { props: { title: value, count: 7 } } }] }
        : { value };
      expect(JSON.parse(finalEvidence.responseText)).toEqual(expected);
      if (ui) {
        await expect(page.getByTestId('ui-leaf')).toHaveCount(1);
        await expect(page.getByTestId('ui-value')).toHaveText(value);
        await expect(page.getByTestId('ui-count')).toHaveText('7');
        await expect(page.getByTestId('ui-panel')).toHaveCount(0);
        await expect(page.getByTestId('ui-fallback')).toHaveCount(0);
      } else
        expect(
          JSON.parse(await page.getByTestId('assistant').innerText()),
        ).toEqual(expected);
    } catch (error) {
      primary = error;
    } finally {
      // Every cleanup/evidence step remains independent; the original failure wins.
      const attempt = async (work: () => Promise<unknown>) => {
        try {
          await work();
        } catch (error) {
          cleanupErrors.push(String(error));
          primary ??= error;
        }
      };
      await attempt(async () => {
        if (
          (await page.getByTestId('status').count()) &&
          (await page.getByTestId('status').innerText()) === 'loading'
        )
          await page.getByTestId('stop').click();
      });
      await attempt(() =>
        page.evaluate(() =>
          (globalThis as unknown as RuntimeState).__localWebLlmDispose?.(),
        ),
      );
      await attempt(async () => {
        await expect(page.getByTestId('status')).toHaveText('idle');
        await expect(page.getByTestId('error')).toBeEmpty();
        const metrics = await page.evaluate(
          () => (globalThis as unknown as RuntimeState).__localWebLlmMetrics,
        );
        expect(metrics).toMatchObject({
          loadedEngines: 1,
          activeRequests: 0,
          unloaded: true,
          workerTerminated: true,
          workerUrlRevoked: true,
        });
        expect((await readReplay(page)).disposed).toBe(requestCount);
        expect(forbidden).toEqual([]);
        expect(errors).toEqual([]);
      });
      for (const part of ['requests', 'schemas', 'responses'] as const) {
        await attempt(async () =>
          attachJson(
            info,
            'raw-engine-' + part,
            await page.evaluate((part) => {
              const evidence = (globalThis as unknown as RuntimeState)
                .__localWebLlmToolsEvidence;
              return evidence?.map((raw) =>
                part === 'requests'
                  ? raw.request
                  : part === 'schemas'
                    ? raw.request.response_format?.schema
                    : { responseText: raw.responseText, chunks: raw.chunks },
              );
            }, part),
          ),
        );
      }
      await attempt(async () =>
        attachJson(
          info,
          'handler-operations',
          await page.getByTestId('operations').innerText(),
        ),
      );
      await attempt(async () =>
        attachJson(info, 'canonical-replay', await readReplay(page)),
      );
      await attempt(async () =>
        attachJson(
          info,
          'framework-output',
          await page.locator('body').innerText(),
        ),
      );
      let metrics: unknown;
      let terminal: unknown;
      await attempt(async () => {
        metrics = await page.evaluate(
          () => (globalThis as unknown as RuntimeState).__localWebLlmMetrics,
        );
      });
      await attempt(async () => {
        terminal = {
          status: await page.getByTestId('status').innerText(),
          error: await page.getByTestId('error').innerText(),
          disposed: (await readReplay(page)).disposed,
        };
      });
      const memory = await readBrowserMemory(page).catch((error: unknown) => ({
        available: false,
        error: String(error),
      }));
      await attempt(async () => {
        await runtime?.stop();
      });
      await attempt(() =>
        attachJson(info, 'metadata', {
          scenario,
          project: info.project.name,
          model: selection.model,
          bundleSha256: runtime?.bundleSha256,
          profile: selection.profile,
          metrics,
          terminal,
          browserVersion: page.context().browser()?.version(),
          memory,
          errors,
          forbidden,
          cleanupErrors,
          expected: {
            requestCount,
            toolNames: dependent
              ? ['lookup_secret', 'follow_secret']
              : ['lookup_secret'],
            lookupArguments: { record: 'alpha' },
            finalResultSource: dependent
              ? 'follow_secret receipt'
              : 'lookup_secret token',
            ...(ui ? { component: 'status', count: 7, componentCount: 1 } : {}),
            terminal: {
              status: 'idle',
              error: '',
              loadedEngines: 1,
              activeRequests: 0,
              unloaded: true,
              workerTerminated: true,
              disposed: requestCount,
            },
          },
          failure: primary === undefined ? undefined : String(primary),
          scope:
            'Same-device text-only bounded tool/schema/one Status canary. Catalog URLs do not establish immutable artifact identity; catalog VRAM is an estimate. No native WebLLM tool calling or broad/nested/media UI claim.',
        }),
      );
    }
    if (primary) throw primary;
  });
}
