import { expect, type Page, test, type TestInfo } from '@playwright/test';
import { createAppDriver } from '../../harness/app-driver';
import { LIVE_BUDGET_MANIFEST } from '../harness/live-budget';
import { validLivePublicApprovalResult } from '../harness/live-native-approval';
import { expectNativeRunCapture } from '../harness/native-wire';
import { withRoutedEndpoint } from '../harness/routed-endpoint';
import {
  type LiveBrowserFixture,
  waitForLiveApprovalPhase,
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
interface LiveApprovalRows {
  readonly session: { readonly id: string; readonly revision: number };
  readonly batches: readonly {
    readonly batch_id: string;
    readonly state: string;
    readonly member_count: number;
    readonly admitted_generation: number;
    readonly admitted_revision: number;
  }[];
  readonly members: readonly {
    readonly request_id: string;
    readonly call_id: string;
    readonly batch_id: string;
    readonly state: string;
    readonly decision: string;
  }[];
  readonly invocations: readonly {
    readonly call_id: string;
    readonly name: string;
    readonly version: number;
    readonly state: string;
    readonly dispatch_generation: number;
  }[];
  readonly effects: readonly {
    readonly id: number;
    readonly session_id: string;
    readonly call_id: string;
    readonly request_id: string;
    readonly batch_id: string;
    readonly admitted_generation: number;
    readonly admitted_revision: number;
    readonly code: string;
  }[];
}

/** Reads authenticated real row observations without attaching raw identifiers to a persistence sink. */
async function liveApprovalRows(
  page: Page,
  fixture: LiveBrowserFixture,
): Promise<LiveApprovalRows> {
  const thread = await page.getByTestId('recovery-thread').textContent();
  if (!thread) throw new Error('LIVE_APPROVAL_STATE_INVALID');
  const response = await fetch(
    `${fixture.url}/__test/native-approval-state?threadId=${encodeURIComponent(thread)}`,
    {
      headers: { 'X-Fixture-Principal': 'alice' },
      signal: AbortSignal.timeout(5_000),
    },
  );
  if (!response.ok) throw new Error('LIVE_APPROVAL_STATE_FAILED');
  return (await response.json()) as LiveApprovalRows;
}

test('native-approval', async ({ page }, info) => {
  await qualify(page, info, 'native-approval', async (fixture) => {
    const errors: string[] = [];
    const onError = (error: Error) => errors.push(error.message);
    page.on('pageerror', onError);
    try {
      await withRoutedEndpoint(fixture.url, async (endpoint) => {
        const driver = createAppDriver(page);
        await page.goto(
          `/?${new URLSearchParams({ scenario: 'plain', runUrl: endpoint.url, recoveryUrl: new URL(endpoint.url).origin, recoveryMode: 'native', fixturePrincipal: 'alice', retries: '0' })}`,
        );

        await driver.send(
          'Call lookupAirport exactly once for code PDX. Wait for the real approval and tool result, then give one short sentence.',
        );
        await expect(page.getByTestId('interrupt-count')).toHaveText('1');
        await expect(page.getByTestId('interrupt-batch-id')).not.toBeEmpty();
        await expect(page.getByTestId('resume')).toBeEnabled();
        const pending = await waitForLiveApprovalPhase(fixture, 1);
        expect(pending.nativeApprovalPendingObserved).toBe(true);
        expect(pending.nativeApprovalDispatches).toBe(0);
        expect(await effects(fixture)).toMatchObject({
          server: 0,
          protected: 0,
          durableNative: 0,
          durableProtected: 0,
          durableNativeProtected: 0,
        });
        const before = await liveApprovalRows(page, fixture);
        expect(before.batches).toHaveLength(1);
        expect(before.batches[0]).toMatchObject({
          state: 'Pending',
          member_count: 1,
        });
        expect(before.members).toHaveLength(1);
        expect(before.members[0].state).toBe('Pending');
        expect(before.invocations).toHaveLength(1);
        expect(before.invocations[0]).toMatchObject({
          state: 'Captured',
          name: 'lookupAirport',
          version: 1,
        });
        expect(before.effects).toHaveLength(0);
        expect(endpoint.responses).toHaveLength(1);
        expect(endpoint.responses[0].complete).toBe(true);
        const first = expectNativeRunCapture(endpoint.responses[0]);
        const terminal = first.at(-1) as {
          outcome: { type: string; interrupts: Array<{ id: string }> };
        };
        expect(
          terminal.outcome.interrupts.map((interrupt) => interrupt.id),
        ).toEqual([before.members[0].request_id]);

        await page.getByTestId('resume').click();
        const approved = await waitForLiveApprovalPhase(fixture, 2);
        await expect(page.getByTestId('resume-error')).toBeEmpty();
        await expect(page.getByTestId('interrupt-count')).toHaveText('0');
        await driver.expectIdle();
        await expect(driver.assistant()).not.toBeEmpty();
        await expect(driver.toolCount()).toHaveText('0');
        const after = await liveApprovalRows(page, fixture);
        expect(after.members).toHaveLength(1);
        expect(after.members[0]).toMatchObject({
          request_id: before.members[0].request_id,
          call_id: before.members[0].call_id,
          decision: 'Approved',
          state: 'Settled',
        });
        expect(after.invocations).toHaveLength(1);
        expect(after.invocations[0]).toMatchObject({
          call_id: before.members[0].call_id,
          state: 'Completed',
          dispatch_generation: approved.nativeApprovalAdmittedGeneration,
        });
        expect(after.effects).toHaveLength(1);
        expect(after.effects[0]).toMatchObject({
          session_id: after.session.id,
          call_id: before.members[0].call_id,
          request_id: before.members[0].request_id,
          batch_id: before.batches[0].batch_id,
          admitted_generation: approved.nativeApprovalAdmittedGeneration,
          admitted_revision: approved.nativeApprovalAdmittedRevision,
          code: 'PDX',
        });
        expect(JSON.parse(endpoint.requests[1]).resume).toEqual([
          {
            interruptId: before.members[0].request_id,
            status: 'resolved',
            payload: { approved: true },
          },
        ]);

        const followup =
          'Reply with one short plain sentence about a quiet sky. Do not call any tools.';
        await driver.send(followup);
        const final = await waitForLiveApprovalPhase(fixture, 3);
        await driver.expectIdle();
        await expect(driver.userMessage()).toHaveText(followup);
        await expect(driver.assistant()).not.toBeEmpty();
        expect(final.nativeApprovalJournalMatched).toBe(true);
        expect(final.nativeApprovalCompletions).toBe(1);
        expect(final.nativeApprovalDispatches).toBe(1);
        expect(await effects(fixture)).toMatchObject({
          server: 0,
          protected: 1,
          durableNative: 0,
          durableProtected: 0,
          durableNativeProtected: 1,
        });
        const later = await liveApprovalRows(page, fixture);
        expect(later.effects).toEqual(after.effects);
        expect(later.members).toEqual(after.members);
        expect(later.invocations).toEqual(after.invocations);
        expect(later.session.revision).toBeGreaterThan(after.session.revision);
        expect(endpoint.requests).toHaveLength(3);
        expect(endpoint.responses).toHaveLength(3);
        const events = endpoint.responses.flatMap((capture) => {
          expect(capture.complete).toBe(true);
          return expectNativeRunCapture(capture);
        });
        const starts = events.filter(
          (event) => event.type === 'TOOL_CALL_START',
        );
        const results = events.filter(
          (event) => event.type === 'TOOL_CALL_RESULT',
        );
        expect(starts).toHaveLength(1);
        expect(results).toHaveLength(1);
        expect(starts[0].toolCallId).toBe(before.members[0].call_id);
        expect(results[0].toolCallId).toBe(before.members[0].call_id);
        expect(starts[0].toolCallName).toBe('lookupAirport');
        expect(
          events.filter(
            (event) =>
              event.type === 'TOOL_CALL_END' &&
              event.toolCallId === starts[0].toolCallId,
          ),
        ).toHaveLength(1);
        for (const raw of endpoint.requests.slice(1)) {
          const request = JSON.parse(raw) as {
            messages: Array<{
              id: string;
              role: string;
              toolCallId?: string;
              toolCalls?: Array<{
                id: string;
                function: { name: string; arguments: string };
              }>;
            }>;
          };
          const calls = request.messages.flatMap((message) =>
            (message.toolCalls ?? []).map((call) => ({
              call,
              parent: message.id,
            })),
          );
          expect(calls).toHaveLength(1);
          expect(calls[0].call.id).toBe(before.members[0].call_id);
          expect(calls[0].parent).toBe(
            starts[0].parentMessageId ??
              `assistant-${before.members[0].call_id}`,
          );
          expect(calls[0].call.function.name).toBe('lookupAirport');
          expect(JSON.parse(calls[0].call.function.arguments)).toEqual({
            code: 'PDX',
          });
        }
        const latest = JSON.parse(endpoint.requests[2]) as {
          messages: Array<Record<string, unknown>>;
          resume?: unknown;
        };
        expect(
          validLivePublicApprovalResult(
            events,
            latest.messages,
            before.members[0].call_id,
            String(
              starts[0].parentMessageId ??
                `assistant-${before.members[0].call_id}`,
            ),
          ),
        ).toBe(true);
        expect(
          latest.messages.filter(
            (message) =>
              message.role === 'tool' &&
              message.toolCallId === before.members[0].call_id,
          ),
        ).toHaveLength(1);
        expect(latest.resume).toBeUndefined();
        for (const id of [
          'resume-error',
          'error',
          'sending-error',
          'generating-error',
          'command-error',
        ])
          await expect(page.getByTestId(id)).toBeEmpty();
        await expect(page.getByTestId('recovery-diagnostic')).toHaveCount(0);
        expect(errors).toEqual([]);
      });
    } finally {
      page.off('pageerror', onError);
    }
  });
});
