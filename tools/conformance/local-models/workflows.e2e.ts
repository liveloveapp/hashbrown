import { EventType } from '@ag-ui/core';
import { expect, type Page, test, type TestInfo } from '@playwright/test';
import { type ChatCompletionRequest, LLMock } from '@copilotkit/aimock';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createLocalWorkflowApi } from './provider-workflow-route';
import type { HashbrownRunInput } from '../harness/agui';

const live = process.env['LOCAL_LLM_WORKFLOWS_LIVE'] === '1';
const providers = live
  ? (['native', 'responses'] as const)
  : (['responses'] as const);
const prompts = {
  independent:
    'Independent workflow: call lookup_secret for alpha and beta, independently in one response. After both results, reply with both exact tokens. Never guess.',
  dependent:
    'Dependent workflow: call lookup_secret for alpha, then pass its exact token to follow_secret as token. Reply with the receipt returned by follow_secret. Never guess.',
  protected:
    'Protected workflow: call protected_lookup for alpha. If denied, do not retry; reply with the exact denial code. Otherwise reply with the exact token returned. Never guess.',
  probe:
    'Confirm workflow: repeat the previous exact tokens without calling any tools.',
};

/** Scripts only model output; framework tools and result replay remain real. */
function respond(request: ChatCompletionRequest) {
  const lastUser = request.messages
    .filter((message) => message.role === 'user')
    .at(-1);
  const results = request.messages.filter((message) => message.role === 'tool');
  const lookup = results.find(
    (message) => message.tool_call_id === 'lookup-alpha',
  );
  const call = (id: string, name: string, args: object) => ({
    id,
    name,
    arguments: JSON.stringify(args),
  });
  if (String(lastUser?.content).startsWith('UI')) {
    return results.length
      ? {
          content: JSON.stringify({
            ui: [{ status: { props: { title: 'alpha', count: 1 } } }],
          }),
        }
      : {
          toolCalls: [call('select-alpha', 'selectItem', { itemId: 'alpha' })],
        };
  }
  if (String(lastUser?.content).startsWith('Confirm')) {
    return { content: results.map((message) => message.content).join(' ') };
  }
  if (String(lastUser?.content).startsWith('Independent')) {
    return results.length
      ? { content: results.map((message) => message.content).join(' ') }
      : {
          toolCalls: [
            call('lookup-alpha', 'lookup_secret', { record: 'alpha' }),
            call('lookup-beta', 'lookup_secret', { record: 'beta' }),
          ],
        };
  }
  if (String(lastUser?.content).startsWith('Dependent')) {
    if (!lookup)
      return {
        toolCalls: [call('lookup-alpha', 'lookup_secret', { record: 'alpha' })],
      };
    if (results.length === 1)
      return {
        toolCalls: [
          call('follow-alpha', 'follow_secret', {
            token: JSON.parse(String(lookup.content)).token,
          }),
        ],
      };
    return { content: String(results.at(-1)?.content) };
  }
  return results.length
    ? { content: String(results.at(-1)?.content) }
    : {
        toolCalls: [
          call('protected-alpha', 'protected_lookup', { record: 'alpha' }),
        ],
      };
}

/** Runs a browser workflow and retains partial evidence even on assertion failure. */
async function workflow(
  page: Page,
  testInfo: TestInfo,
  provider: 'native' | 'responses',
  run: (requests: HashbrownRunInput[]) => Promise<void>,
  generativeUi = false,
) {
  const mock = live ? undefined : new LLMock({ port: 0 });
  mock?.onMessage(/workflow:/i, respond);
  await mock?.start();
  const requests: HashbrownRunInput[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const route = createLocalWorkflowApi({
    provider,
    host:
      mock?.url ?? process.env['LOCAL_LLM_HOST'] ?? 'http://127.0.0.1:11434',
    model: process.env['LOCAL_LLM_MODEL'] ?? 'qwen2.5:14b',
  });
  const server: Server = route.app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const { port } = server.address() as AddressInfo;
    page.on('request', (request) => {
      if (request.url().endsWith('/api/chat') && request.method() === 'POST')
        requests.push(request.postDataJSON());
    });
    await page.goto(
      (generativeUi
        ? '/?scenario=ui&native=true&runUrl='
        : '/?localWorkflow=true&runUrl=') +
        encodeURIComponent(`http://127.0.0.1:${port}/api/chat`),
    );

    await run(requests);

    expect(new Set(requests.map((request) => request.runId)).size).toBe(
      requests.length,
    );
    for (const [index, request] of requests.entries()) {
      expect(request.runId).toEqual(expect.any(String));
      if (index === 0) continue;
      const previous = requests[index - 1];
      expect(request.threadId).toBe(previous.threadId);
      expect(request.runId).not.toBe(previous.runId);
      expect(request.messages.slice(0, previous.messages.length)).toEqual(
        previous.messages,
      );
      for (const message of request.messages) {
        if (message.role !== 'tool') continue;
        const calls = request.messages.flatMap((item) =>
          item.role === 'assistant' ? (item.toolCalls ?? []) : [],
        );
        expect(
          calls.filter((call) => call.id === message.toolCallId),
        ).toHaveLength(1);
      }
    }
    await expect(page.getByTestId('status')).toHaveText('idle');
    await expect(page.getByTestId('error')).toBeEmpty();
    for (const record of route.evidence) {
      expect(record.failure).toBeUndefined();
      expect(
        record.events.filter((event) => event.type === EventType.RUN_ERROR),
      ).toEqual([]);
      expect(record.events.at(-1)?.type).toBe(EventType.RUN_FINISHED);
    }
    expect(errors).toEqual([]);
  } finally {
    await testInfo.attach('workflow-evidence.json', {
      body: JSON.stringify(
        {
          live,
          provider,
          host:
            mock?.url ??
            process.env['LOCAL_LLM_HOST'] ??
            'http://127.0.0.1:11434',
          model: process.env['LOCAL_LLM_MODEL'] ?? 'qwen2.5:14b',
          runs: route.evidence,
          requests,
          errors,
          journal: mock?.getRequests(),
          operations: await page
            .getByTestId('operations')
            .textContent({ timeout: 1_000 })
            .catch(() => null),
          answer: await page
            .getByTestId('assistant')
            .textContent({ timeout: 1_000 })
            .catch(() => null),
        },
        null,
        2,
      ),
      contentType: 'application/json',
    });
    await page
      .screenshot({ path: testInfo.outputPath('workflow.png') })
      .catch(() => undefined);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await mock?.stop();
  }
}

/** Sends a user turn through the fixture controls. */
async function send(page: Page, prompt: string) {
  await page.getByTestId('prompt').fill(prompt);
  await page.getByTestId('send').click();
}

for (const provider of providers) {
  test(`${provider}: executes independent tools and preserves results on a second turn`, async ({
    page,
  }, testInfo) => {
    await workflow(page, testInfo, provider, async (requests) => {
      await send(page, prompts.independent);

      await expect(page.getByTestId('operation-count')).toHaveText('2');
      await expect(page.getByTestId('status')).toHaveText('idle');
      const operations = JSON.parse(
        await page.getByTestId('operations').innerText(),
      ) as { token: string; record: string }[];
      expect(operations.map((operation) => operation.record).sort()).toEqual([
        'alpha',
        'beta',
      ]);
      for (const operation of operations)
        await expect(page.getByTestId('assistant')).toContainText(
          operation.token,
        );
      expect(requests).toHaveLength(2);
      const completed = requests.at(-1);
      expect(
        completed?.messages.filter((message) => message.role === 'tool'),
      ).toHaveLength(2);

      const previousRequestCount = requests.length;
      await send(page, prompts.probe);

      await expect.poll(() => requests.length).toBe(previousRequestCount + 1);
      await expect(page.getByTestId('status')).toHaveText('idle');
      for (const operation of operations)
        await expect(page.getByTestId('assistant')).toContainText(
          operation.token,
        );
      await expect(page.getByTestId('operation-count')).toHaveText('2');
      const probe = requests.at(-1);
      expect(probe?.threadId).toBe(completed?.threadId);
      expect(probe?.runId).not.toBe(completed?.runId);
      expect(probe?.messages.slice(0, completed?.messages.length)).toEqual(
        completed?.messages,
      );
    });
  });

  test(`${provider}: uses an actual result in a dependent tool`, async ({
    page,
  }, testInfo) => {
    await workflow(page, testInfo, provider, async (requests) => {
      await send(page, prompts.dependent);

      await expect(page.getByTestId('operation-count')).toHaveText('2');
      await expect(page.getByTestId('status')).toHaveText('idle');
      const operations = JSON.parse(
        await page.getByTestId('operations').innerText(),
      ) as { token?: string; receipt?: string }[];
      expect(operations[1].token).toBe(operations[0].token);
      await expect(page.getByTestId('assistant')).toContainText(
        String(operations[1].receipt),
      );
      expect(
        requests.at(-1)?.messages.filter((message) => message.role === 'tool'),
      ).toHaveLength(2);
    });
  });

  for (const allowed of [true, false]) {
    test(`${provider}: app-owned permission ${allowed ? 'allows' : 'denies'} a protected handler`, async ({
      page,
    }, testInfo) => {
      await workflow(page, testInfo, provider, async (requests) => {
        await send(page, prompts.protected);

        await expect(page.getByTestId('permission-pending')).toHaveText('true');
        await expect(page.getByTestId('operation-count')).toHaveText('0');
        expect(requests).toHaveLength(1);

        await page
          .getByTestId(allowed ? 'permission-allow' : 'permission-deny')
          .click();

        await expect(page.getByTestId('status')).toHaveText('idle');
        await expect(page.getByTestId('operation-count')).toHaveText(
          allowed ? '1' : '0',
        );
        await expect(page.getByTestId('permission-pending')).toHaveText(
          'false',
        );
        const result = requests
          .at(-1)
          ?.messages.find((message) => message.role === 'tool');
        expect(result).toBeDefined();
        if (allowed) {
          const operations = JSON.parse(
            await page.getByTestId('operations').innerText(),
          ) as { token: string }[];
          await expect(page.getByTestId('assistant')).toContainText(
            operations[0].token,
          );
          expect(result?.content).toContain(operations[0].token);
        } else {
          await expect(page.getByTestId('assistant')).toContainText(
            'HB_PERMISSION_DENIED',
          );
          expect(result).toMatchObject({
            error: expect.stringContaining('HB_PERMISSION_DENIED'),
          });
        }
      });
    });
  }
}

for (const provider of providers) {
  test(`${provider}: semantic golden composes an executed tool and trusted final UI`, async ({
    page,
  }, testInfo) => {
    const knownLimitation =
      live && process.env['LOCAL_LLM_SCHEMA_TOOLS_UNSUPPORTED'] === '1';
    let observedSchemaOnly = false;
    await workflow(
      page,
      testInfo,
      provider,
      async (requests) => {
        await send(
          page,
          'UI workflow: call selectItem with itemId alpha exactly once. After receiving its result render one status component with title exactly alpha and count 1. Never skip the tool.',
        );

        await expect.poll(() => requests.length).toBeGreaterThan(0);
        await expect(page.getByTestId('status')).toHaveText('idle');
        await expect(page.getByTestId('error')).toBeEmpty();
        const skippedTool =
          requests.length === 1 &&
          (await page.getByTestId('tool-count').textContent()) === '0';
        if (knownLimitation && skippedTool) {
          // Only recognize the observed successful, rendered schema-only answer.
          // Transport, malformed JSON and component errors remain ordinary failures.
          await expect(page.getByTestId('status-card')).toHaveText('alpha: 1');
          expect(requests[0].forwardedProps?.hashbrown).toMatchObject({
            ui: true,
            responseSchema: expect.any(Object),
          });
          observedSchemaOnly = true;
          return;
        }
        await expect(page.getByTestId('tool-count')).toHaveText('1');
        await expect(page.getByTestId('selected-item')).toHaveText('alpha');
        await expect(page.getByTestId('status-card')).toHaveText('alpha: 1');
        expect(requests).toHaveLength(2);
        expect(requests[1].messages).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              role: 'tool',
              content: JSON.stringify({ itemId: 'alpha' }),
            }),
          ]),
        );
      },
      true,
    );

    // Set the expected failure only after the route and framework checks pass.
    test.fail(
      knownLimitation,
      'The local model skips tools when the UI schema is supplied; remove the limitation flag when this golden passes.',
    );
    expect(
      observedSchemaOnly,
      'The model rendered the schema without executing selectItem.',
    ).toBe(false);
  });
}
