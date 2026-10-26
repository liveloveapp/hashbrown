import type { TransportFactory, WebLlmChunk } from '@hashbrownai/core';
import {
  type ChatCompletionRequest,
  type FixtureResponse,
  LLMock,
} from '@copilotkit/aimock';
import { expect, type Page, test, type TestInfo } from '@playwright/test';
import { installLocalModelShim } from './shim';
import { installWebLlmToolObserver } from './webllm-tool-observer';

type Request = {
  messages: { role: string; content: string }[];
  response_format: { type: string; schema: string };
  tools?: unknown;
};
type Envelope = {
  type: string;
  protocol: number;
  callId: string;
  name: string;
  arguments?: object;
  status?: string;
  text?: string;
};
type Observation = {
  calls: Request[];
  contexts: {
    threadId: string;
    runId: string;
    userMessage: { id: string; content: string };
    completedCalls: {
      callId: string;
      name: string;
      arguments: object;
      result: { type: string; text: string };
    }[];
    frozen: boolean;
  }[];
  canonical: { messages: unknown[] }[];
  events: {
    type: string;
    toolCallId?: string;
    toolCallName?: string;
    delta?: string;
  }[];
  lifecycle: string[];
  chunks: WebLlmChunk[];
  active: number;
  disposed: number;
};
type Scenario =
  | 'lookup'
  | 'dependent'
  | 'ui'
  | 'no-tools'
  | 'followup'
  | 'permission'
  | 'error'
  | 'invalid-json'
  | 'wrong-type'
  | 'unknown-fields'
  | 'native-content'
  | 'stop';

/** Reads labeled conversation data without relying on preselected handler secrets. */
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

/** Produces argument JSON or a final schema value using actual projected results. */
function respond(
  scenario: Scenario,
  raw: ChatCompletionRequest,
): FixtureResponse {
  const request = raw as unknown as Request;
  const schema = JSON.parse(request.response_format.schema) as {
    properties: Record<string, unknown>;
  };
  const results = envelopes(request).filter(
    (message) => message.type === 'hashbrown.tool_result',
  );
  const last = JSON.parse(results.at(-1)?.text ?? '{}') as {
    token?: string;
    receipt?: string;
  };
  if ('record' in schema.properties) {
    if (scenario === 'invalid-json') return { content: 'NOT_JSON' };
    if (scenario === 'native-content')
      return {
        content: JSON.stringify({
          record: 'alpha',
          tool_calls: [
            {
              id: 'content-canary',
              name: 'lookup_secret',
              arguments: { record: 'beta' },
            },
          ],
        }),
      };
    if (scenario === 'wrong-type') return { content: '{"record":7}' };
    if (scenario === 'unknown-fields')
      return { content: '{"record":"alpha","extra":true}' };
    return {
      content: JSON.stringify({
        record:
          scenario === 'stop' &&
          !request.messages.some((m) => m.content === 'fresh request')
            ? 'alpha'.repeat(100)
            : 'alpha',
      }),
    };
  }
  if ('token' in schema.properties)
    return { content: JSON.stringify({ token: last.token }) };
  const value = last.receipt ?? last.token ?? 'DIRECT_FINAL';
  return {
    content: JSON.stringify(
      scenario === 'ui'
        ? { ui: [{ status: { props: { title: value, count: 7 } } }] }
        : { value },
    ),
  };
}

/** Collects raw engine requests separately from canonical framework replay. */
async function observe(page: Page): Promise<Observation> {
  return page.evaluate(() => {
    const runtime = globalThis as unknown as {
      __localModelCalls: Request[];
      __webLlmToolContexts?: Observation['contexts'];
      __webLlmToolCanonical?: Observation['canonical'];
      __webLlmToolEvents?: Observation['events'];
      __localModelLifecycle: string[];
      __webLlmRawChunks?: WebLlmChunk[];
      __webLlmActive?: number;
      __webLlmToolDisposed?: number;
    };
    return {
      calls: runtime.__localModelCalls,
      contexts: runtime.__webLlmToolContexts ?? [],
      canonical: runtime.__webLlmToolCanonical ?? [],
      events: runtime.__webLlmToolEvents ?? [],
      lifecycle: runtime.__localModelLifecycle,
      chunks: runtime.__webLlmRawChunks ?? [],
      active: runtime.__webLlmActive ?? 0,
      disposed: runtime.__webLlmToolDisposed ?? 0,
    };
  });
}

const invalidArgumentsError =
  'Local model returned invalid structured tool arguments';
const failedToolPhaseError =
  'Application tool phase refuses a failed tool result.';

/** Checks the final framework view after transport disposal and engine drain. */
async function assertTerminalState(
  page: Page,
  expectedError: string,
): Promise<void> {
  await expect(page.getByTestId('status')).toHaveText('idle');
  await expect(page.getByTestId('error')).toHaveText(expectedError);
}

/** Captures terminal evidence independently of cleanup and assertion failures. */
async function readTerminalState(page: Page) {
  const [status, error] = await Promise.all([
    page.getByTestId('status').innerText(),
    page.getByTestId('error').innerText(),
  ]);
  return { status, error };
}

/** Runs only an injected LLMock engine and retains evidence after cleanup on every outcome. */
async function workflow(
  page: Page,
  info: TestInfo,
  scenario: Scenario,
  run: () => Promise<void>,
  expectedError = '',
) {
  const responses: FixtureResponse[] = [];
  const mock = new LLMock({
    port: 0,
    chunkSize: 3,
    latency: scenario === 'stop' ? 60 : 1,
  });
  mock.onMessage(/./, (request) => {
    const response = respond(scenario, request);
    responses.push(response);
    return response;
  });
  const errors: string[] = [];
  const forbidden: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/forbidden-run')
      forbidden.push(request.url());
  });
  await mock.start();
  let primary: unknown;
  let observed: Observation | undefined;
  try {
    await installLocalModelShim(page, mock.url);
    await installWebLlmToolObserver(page);
    await page.goto(
      '/?localModel=webllm-tools&' +
        (scenario === 'ui'
          ? 'localUiWorkflow=true'
          : 'localSchemaWorkflow=true') +
        '&uiWorkflow=' +
        (scenario === 'followup' ? 'lookup' : scenario) +
        '&runUrl=' +
        encodeURIComponent('http://127.0.0.1:1/forbidden-run'),
    );
    await run();
  } catch (error) {
    primary = error;
  } finally {
    try {
      const stop = page.getByTestId('stop');
      if (
        (await stop.count()) &&
        (await page.getByTestId('status').innerText()) === 'loading'
      )
        await stop.click();
      await expect(page.getByTestId('status')).toHaveText('idle');
      await expect.poll(async () => (await observe(page)).active).toBe(0);
      await expect
        .poll(async () => {
          const value = await observe(page);
          return value.disposed === value.calls.length;
        })
        .toBe(true);
      observed = await observe(page);
      expect(
        observed.calls.every(
          (call) =>
            call.tools === undefined &&
            call.response_format.type === 'json_object',
        ),
      ).toBe(true);
      expect(errors).toEqual([]);
      expect(forbidden).toEqual([]);
    } catch (error) {
      primary ??= error;
    }
    observed ??= await observe(page).catch(() => undefined);
    const journal = mock.getRequests();
    await mock.stop().catch((error: unknown) => {
      primary ??= error;
    });
    try {
      await assertTerminalState(page, expectedError);
    } catch (error) {
      primary ??= error;
    }
    const terminal = await readTerminalState(page).catch(() => undefined);
    for (const [name, value] of Object.entries({
      metadata: {
        scenario,
        project: info.project.name,
        engine: 'LLMock injected text engine',
        modelLoaded: false,
        active: observed?.active,
        disposed: observed?.disposed,
        terminal,
        expectedTerminal: { status: 'idle', error: expectedError },
        errors,
        forbidden,
      },
      'raw-engine-requests': observed?.calls,
      'raw-responses': { responses, chunks: observed?.chunks, journal },
      'canonical-replay': {
        contexts: observed?.contexts,
        inputs: observed?.canonical,
        events: observed?.events,
        lifecycle: observed?.lifecycle,
      },
      'framework-history': await page
        .getByTestId('history')
        .textContent()
        .catch(() => null),
    })) {
      try {
        await info.attach(name + '.json', {
          contentType: 'application/json',
          body: JSON.stringify(value ?? null, null, 2),
        });
      } catch (error) {
        primary ??= error;
      }
    }
  }
  if (primary) throw primary;
}

/** Sends a user turn through a real framework fixture. */
async function send(page: Page, prompt = 'tool contract request') {
  await page.getByTestId('prompt').fill(prompt);
  await page.getByTestId('send').click();
}

for (const scenario of [
  'lookup',
  'dependent',
  'ui',
  'no-tools',
  'followup',
] as const) {
  test(`WebLLM structured tools ${scenario} preserves exact canonical results`, async ({
    page,
  }, info) => {
    await workflow(page, info, scenario, async () => {
      await send(page);

      if (scenario === 'ui')
        await expect(page.getByTestId('ui-value')).not.toBeEmpty();
      else await expect(page.getByTestId('assistant')).not.toBeEmpty();
      await expect(page.getByTestId('status')).toHaveText('idle');
      await expect(page.getByTestId('error')).toBeEmpty();
      const operations = JSON.parse(
        await page.getByTestId('operations').innerText(),
      ) as { name: string; record?: string; token: string; receipt?: string }[];
      expect(operations).toHaveLength(
        scenario === 'no-tools' ? 0 : scenario === 'dependent' ? 2 : 1,
      );
      const value =
        operations.at(-1)?.receipt ??
        operations.at(-1)?.token ??
        'DIRECT_FINAL';
      if (scenario === 'dependent')
        expect(operations[1].token).toBe(operations[0].token);
      if (operations.length)
        expect(operations[0]).toMatchObject({
          name: 'lookup_secret',
          record: 'alpha',
        });
      if (scenario === 'ui') {
        await expect(page.getByTestId('ui-leaf')).toHaveCount(1);
        await expect(page.getByTestId('ui-value')).toHaveText(value);
        await expect(page.getByTestId('ui-count')).toHaveText('7');
      } else
        expect(
          JSON.parse(await page.getByTestId('assistant').innerText()),
        ).toEqual({ value });
      const observed = await observe(page);
      expect(observed.calls).toHaveLength(operations.length + 1);
      expect(observed.calls.every((call) => call.tools === undefined)).toBe(
        true,
      );
      expect(
        observed.calls.every(
          (call) => call.response_format.type === 'json_object',
        ),
      ).toBe(true);
      expect(
        observed.calls.every((call) => call.messages[0].role === 'system'),
      ).toBe(true);
      expect(observed.calls[0].messages[0].content).toContain(
        scenario === 'ui'
          ? 'Call only declared tools'
          : 'Follow the requested workflow.',
      );
      expect(observed.contexts.every((context) => context.frozen)).toBe(true);
      expect(
        observed.contexts.every(
          (context) =>
            context.threadId === observed.contexts[0].threadId &&
            context.userMessage.id === observed.contexts[0].userMessage.id,
        ),
      ).toBe(true);
      expect(
        observed.events
          .filter((event) => event.type === 'TOOL_CALL_START')
          .map((event) => event.toolCallId),
      ).toEqual(
        (observed.contexts.at(-1)?.completedCalls ?? []).map(
          (call) => call.callId,
        ),
      );
      expect(
        observed.events.filter((event) => event.type === 'RUN_FINISHED'),
      ).toHaveLength(observed.calls.length);
      expect(
        observed.contexts.map((context) => context.completedCalls.length),
      ).toEqual(operations.map((_, i) => i).concat(operations.length));
      const final = observed.calls.at(-1);
      if (!final) throw new Error('Missing final engine request.');
      const replay = envelopes(final);
      expect(replay).toHaveLength(operations.length * 2);
      for (let index = 0; index < operations.length; index++) {
        const call = replay[index * 2];
        const result = replay[index * 2 + 1];
        expect(call).toMatchObject({
          type: 'hashbrown.tool_call',
          protocol: 1,
          name: operations[index].name,
        });
        expect(result).toMatchObject({
          type: 'hashbrown.tool_result',
          protocol: 1,
          callId: call.callId,
          name: call.name,
          status: 'success',
        });
        expect(observed.contexts.at(-1)?.completedCalls[index]).toEqual({
          callId: call.callId,
          name: call.name,
          arguments: call.arguments,
          result: { type: 'success', text: result.text },
        });
        expect(JSON.parse(result.text ?? '')).toMatchObject(
          index === 0
            ? { token: operations[0].token }
            : { receipt: operations[1].receipt },
        );
      }
      expect(JSON.parse(final.response_format.schema)).toHaveProperty(
        'properties.' + (scenario === 'ui' ? 'ui' : 'value'),
      );
      if (scenario !== 'no-tools')
        expect(
          JSON.parse(observed.calls[0].response_format.schema),
        ).toMatchObject({
          type: 'object',
          additionalProperties: false,
          required: ['record'],
          properties: { record: { type: 'string' } },
        });
      if (scenario === 'followup') {
        await send(page, 'Without calling tools return previous exact value');
        await expect
          .poll(async () => (await observe(page)).calls.length)
          .toBe(3);
        await expect(page.getByTestId('status')).toHaveText('idle');
        expect(
          JSON.parse(await page.getByTestId('assistant').innerText()),
        ).toEqual({ value });
        const follow = (await observe(page)).contexts.at(-1);
        if (!follow) throw new Error('Missing follow-up context.');
        expect(follow.completedCalls).toEqual([]);
        expect(follow.userMessage.id).not.toBe(
          observed.contexts[0].userMessage.id,
        );
        expect(follow.userMessage.content).toBe(
          'Without calling tools return previous exact value',
        );
        expect(envelopes((await observe(page)).calls.at(-1) ?? final)).toEqual(
          replay,
        );
        await expect(page.getByTestId('operation-count')).toHaveText('1');
      }
    });
  });
}

for (const scenario of [
  'invalid-json',
  'wrong-type',
  'unknown-fields',
  'native-content',
  'error',
] as const) {
  test(`WebLLM structured tools rejects ${scenario} without business side effects`, async ({
    page,
  }, info) => {
    await workflow(
      page,
      info,
      scenario,
      async () => {
        await send(page);

        await expect(page.getByTestId('error')).toContainText(
          scenario === 'error'
            ? 'Application tool phase refuses a failed tool result'
            : 'invalid structured tool arguments',
        );
        await expect(page.getByTestId('status')).toHaveText('idle');
        await expect(page.getByTestId('operation-count')).toHaveText('0');
        await expect(page.getByTestId('invocation-count')).toHaveText(
          scenario === 'error' ? '1' : '0',
        );
        await expect(page.getByTestId('assistant')).toBeEmpty();
        expect((await observe(page)).calls).toHaveLength(1);
        if (scenario === 'error')
          expect(
            (await observe(page)).contexts.at(-1)?.completedCalls[0].result,
          ).toEqual({ type: 'error', text: 'HB_TOOL_FAILURE' });
      },
      scenario === 'error' ? failedToolPhaseError : invalidArgumentsError,
    );
  });
}

for (const allowed of [true, false]) {
  test(`WebLLM structured tools application permission ${allowed ? 'allow' : 'deny'}`, async ({
    page,
  }, info) => {
    await workflow(
      page,
      info,
      'permission',
      async () => {
        await send(page);
        await expect(page.getByTestId('permission-pending')).toHaveText('true');
        await expect(page.getByTestId('invocation-count')).toHaveText('1');
        await expect(page.getByTestId('operation-count')).toHaveText('0');

        await page
          .getByTestId(allowed ? 'permission-allow' : 'permission-deny')
          .click();

        await expect(page.getByTestId('status')).toHaveText('idle');
        await expect(page.getByTestId('operation-count')).toHaveText(
          allowed ? '1' : '0',
        );
        await expect(page.getByTestId('invocation-count')).toHaveText('1');
        if (allowed) {
          await expect(page.getByTestId('assistant')).not.toBeEmpty();
          await expect(page.getByTestId('error')).toBeEmpty();
          const operations = JSON.parse(
            await page.getByTestId('operations').innerText(),
          ) as { token: string }[];
          expect(
            JSON.parse(await page.getByTestId('assistant').innerText()),
          ).toEqual({ value: operations[0].token });
        } else {
          await expect(page.getByTestId('error')).toContainText(
            'Application tool phase refuses a failed tool result',
          );
          expect((await observe(page)).calls).toHaveLength(1);
          expect(
            (await observe(page)).contexts.at(-1)?.completedCalls[0].result,
          ).toEqual({ type: 'error', text: 'HB_PERMISSION_DENIED' });
        }
      },
      allowed ? '' : failedToolPhaseError,
    );
  });
}

test('WebLLM structured tools Stop discards buffered arguments and accepts a fresh request', async ({
  page,
}, info) => {
  await workflow(page, info, 'stop', async () => {
    await send(page, 'preserved latest request marker');
    await expect
      .poll(async () =>
        (await observe(page)).chunks.some((chunk) =>
          chunk.choices.some((choice) => !!choice.delta.content),
        ),
      )
      .toBe(true);
    await page.getByTestId('stop').click();

    await expect(page.getByTestId('status')).toHaveText('idle');
    await expect(page.getByTestId('operation-count')).toHaveText('0');
    await expect(page.getByTestId('invocation-count')).toHaveText('0');
    expect(JSON.stringify((await observe(page)).canonical.at(-1))).toContain(
      'preserved latest request marker',
    );
    await expect
      .poll(async () => (await observe(page)).lifecycle)
      .toContain('interrupted');

    await send(page, 'fresh request');
    await expect(page.getByTestId('operation-count')).toHaveText('1');
    await expect(page.getByTestId('status')).toHaveText('idle');
    await expect(page.getByTestId('error')).toBeEmpty();
    expect(JSON.stringify((await observe(page)).canonical.at(-1))).toContain(
      'preserved latest request marker',
    );
  });
});

/** Owns controlled-worker cleanup and separates raw evidence from descriptive metadata. */
async function workerWorkflow(
  page: Page,
  info: TestInfo,
  mode: 'gated-done' | 'native-canary',
  run: () => Promise<void>,
) {
  const { installWebLlmToolWorker } = await import('./webllm-tool-worker-shim');
  const expectedError = mode === 'native-canary' ? invalidArgumentsError : '';
  const errors: string[] = [];
  const forbidden: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/forbidden-run')
      forbidden.push(request.url());
  });
  await installWebLlmToolWorker(page, mode);
  let primary: unknown;
  try {
    await page.goto(
      '/?localSchemaWorkflow=true&localModel=webllm-tools&uiWorkflow=lookup&runUrl=http://127.0.0.1:1/forbidden-run',
    );
    await run();
  } catch (error) {
    primary = error;
  } finally {
    try {
      await page.evaluate(() => {
        const runtime = globalThis as unknown as {
          __releaseToolWorker?(): void;
          __stopText?(): void;
        };
        runtime.__stopText?.();
        runtime.__releaseToolWorker?.();
      });
      if (
        (await page.getByTestId('status').count()) &&
        (await page.getByTestId('status').innerText()) === 'loading'
      )
        await page.getByTestId('stop').click();
      await page.evaluate(
        () =>
          (globalThis as unknown as { __textWork?: Promise<string> })
            .__textWork,
      );
      await expect
        .poll(() =>
          page.evaluate(() => {
            const metrics = (
              globalThis as unknown as {
                __toolWorker?: { drained: number; requests: unknown[] };
              }
            ).__toolWorker;
            return metrics
              ? metrics.drained - metrics.requests.length
              : undefined;
          }),
        )
        .toBe(0);
    } catch (error) {
      primary ??= error;
    }
    try {
      await page.evaluate(() =>
        (
          globalThis as unknown as { __closeToolWorker?(): void }
        ).__closeToolWorker?.(),
      );
      await assertTerminalState(page, expectedError);
      expect(errors).toEqual([]);
      expect(forbidden).toEqual([]);
    } catch (error) {
      primary ??= error;
    }
    const terminal = await readTerminalState(page).catch(() => undefined);
    const metrics = await page
      .evaluate(
        () =>
          (
            globalThis as unknown as {
              __toolWorker?: {
                requests: unknown[];
                chunks: unknown[];
                waiting: number;
                interrupts: number;
                drained: number;
                closed: boolean;
              };
            }
          ).__toolWorker,
      )
      .catch(() => undefined);
    for (const [name, value] of Object.entries({
      metadata: {
        engine: 'controlled isolated worker',
        modelLoaded: false,
        mode,
        project: info.project.name,
        errors,
        forbidden,
        waiting: metrics?.waiting,
        interrupts: metrics?.interrupts,
        drained: metrics?.drained,
        closed: metrics?.closed,
        terminal,
        expectedTerminal: { status: 'idle', error: expectedError },
      },
      'raw-worker-requests': metrics?.requests,
      'raw-worker-responses': metrics?.chunks,
      'canonical-replay': await observe(page).catch(() => null),
    })) {
      try {
        await info.attach(name + '.json', {
          contentType: 'application/json',
          body: JSON.stringify(value ?? null, null, 2),
        });
      } catch (error) {
        primary ??= error;
      }
    }
  }
  if (primary) throw primary;
}

/** Reads worker clone/drain counters independently of framework output. */
async function workerMetrics(page: Page) {
  return page.evaluate(
    () =>
      (
        globalThis as unknown as {
          __toolWorker: {
            requests: Request[];
            waiting: number;
            interrupts: number;
            drained: number;
            chunks: unknown[];
          };
        }
      ).__toolWorker,
  );
}

for (const cancelled of [false, true]) {
  test(`WebLLM tool worker gates iterator done before dispatch${cancelled ? ' and after Stop' : ''}`, async ({
    page,
  }, info) => {
    await workerWorkflow(page, info, 'gated-done', async () => {
      await send(page, 'worker clone marker');
      await expect
        .poll(async () => (await workerMetrics(page)).waiting)
        .toBe(1);
      await expect(page.getByTestId('operation-count')).toHaveText('0');
      await expect(page.getByTestId('invocation-count')).toHaveText('0');
      const cloned = (await workerMetrics(page)).requests[0];
      expect(cloned.tools).toBeUndefined();
      expect(cloned.messages.at(-1)).toEqual({
        role: 'user',
        content: 'worker clone marker',
      });
      expect(JSON.parse(cloned.response_format.schema)).toMatchObject({
        type: 'object',
        required: ['record'],
        additionalProperties: false,
      });
      if (cancelled) {
        await page.getByTestId('stop').click();
        await expect(page.getByTestId('status')).toHaveText('idle');
        await send(page, 'busy request');
        await expect(page.getByTestId('error')).toContainText(
          'already generating',
        );
        expect((await workerMetrics(page)).requests).toHaveLength(1);
        expect(
          (await observe(page)).events.some(
            (event) => event.type === 'TOOL_CALL_START',
          ),
        ).toBe(false);
      }

      await page.evaluate(() =>
        (
          globalThis as unknown as { __releaseToolWorker(): void }
        ).__releaseToolWorker(),
      );

      if (cancelled) {
        await expect
          .poll(async () => (await workerMetrics(page)).drained)
          .toBe(1);
        await expect(page.getByTestId('operation-count')).toHaveText('0');
        await send(page, 'fresh worker request');
      }
      await expect(page.getByTestId('operation-count')).toHaveText('1');
      await expect(page.getByTestId('assistant')).not.toBeEmpty();
      await expect(page.getByTestId('status')).toHaveText('idle');
      await expect(page.getByTestId('error')).toBeEmpty();
      const operations = JSON.parse(
        await page.getByTestId('operations').innerText(),
      ) as { token: string }[];
      expect(
        JSON.parse(await page.getByTestId('assistant').innerText()),
      ).toEqual({ value: operations[0].token });
    });
  });
}

test('WebLLM tool worker native tool_calls cannot execute a canary', async ({
  page,
}, info) => {
  await workerWorkflow(page, info, 'native-canary', async () => {
    await send(page);

    await expect(page.getByTestId('error')).not.toBeEmpty();
    await expect(page.getByTestId('status')).toHaveText('idle');
    await expect(page.getByTestId('invocation-count')).toHaveText('0');
    await expect(page.getByTestId('operation-count')).toHaveText('0');
    expect((await workerMetrics(page)).requests).toHaveLength(1);
    expect(JSON.stringify((await workerMetrics(page)).chunks)).toContain(
      'native-canary',
    );
    expect(
      (await observe(page)).events.some(
        (event) => event.type === 'TOOL_CALL_START',
      ),
    ).toBe(false);
  });
});

/** Starts a real text adapter sharing the fixture's engine and records its terminal result. */
async function startTextOverlap(page: Page): Promise<void> {
  await page.evaluate(() => {
    const runtime = globalThis as unknown as {
      __webLlmTextTransport: TransportFactory;
      __textWork: Promise<string>;
      __stopText(): void;
    };
    const controller = new AbortController();
    runtime.__stopText = () => controller.abort();
    runtime.__textWork = (async () => {
      try {
        const response = await runtime.__webLlmTextTransport().send({
          input: {
            threadId: 'text-thread',
            runId: crypto.randomUUID(),
            messages: [
              {
                id: crypto.randomUUID(),
                role: 'user',
                content: 'text overlap marker',
              },
            ],
            tools: [],
            context: [],
            state: undefined,
            forwardedProps: {},
          },
          signal: controller.signal,
          attempt: 1,
          maxAttempts: 1,
          requestId: crypto.randomUUID(),
        });
        try {
          for await (const event of response.events) {
            if (event.type === 'RUN_ERROR') throw new Error(event.message);
          }
        } finally {
          await response.dispose?.();
        }
        return 'complete';
      } catch (error) {
        return String(error);
      }
    })();
  });
}

for (const textFirst of [true, false]) {
  test(`WebLLM text and tool adapters share worker ownership with ${textFirst ? 'text' : 'tools'} first`, async ({
    page,
  }, info) => {
    await workerWorkflow(page, info, 'gated-done', async () => {
      if (textFirst) await startTextOverlap(page);
      else await send(page);
      await expect
        .poll(async () => (await workerMetrics(page)).waiting)
        .toBe(1);

      if (textFirst) {
        await send(page, 'overlapping tool request');
        await expect(page.getByTestId('error')).toContainText(
          'already generating',
        );
      } else {
        await startTextOverlap(page);
        expect(
          await page.evaluate(
            () =>
              (globalThis as unknown as { __textWork: Promise<string> })
                .__textWork,
          ),
        ).toContain('already generating');
      }
      expect((await workerMetrics(page)).requests).toHaveLength(1);
      await expect(page.getByTestId('invocation-count')).toHaveText('0');

      await page.evaluate(() =>
        (
          globalThis as unknown as { __releaseToolWorker(): void }
        ).__releaseToolWorker(),
      );

      if (textFirst) {
        expect(
          await page.evaluate(
            () =>
              (globalThis as unknown as { __textWork: Promise<string> })
                .__textWork,
          ),
        ).toBe('complete');
        await send(page, 'fresh tool request after text');
      }
      await expect(page.getByTestId('assistant')).not.toBeEmpty();
      await expect(page.getByTestId('operation-count')).toHaveText('1');
      await expect(page.getByTestId('status')).toHaveText('idle');
      await expect(page.getByTestId('error')).toBeEmpty();
    });
  });
}
