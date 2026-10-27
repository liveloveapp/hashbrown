import { expect, type Page } from '@playwright/test';
import { createAppDriver } from '../../harness/app-driver';
import {
  type LiveBrowserFixture,
  waitForLiveApprovalPhase,
} from './live-browser-fixture';
import { validLivePublicApprovalResult } from './live-native-approval';
import { expectNativeRunCapture } from './native-wire';
import type { RoutedEndpoint } from './routed-endpoint';

/** Reads genuine fixture effect counters without adding native work. */
async function effects(fixture: LiveBrowserFixture) {
  const response = await fetch(`${fixture.url}/__test/counters`, {
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error('LIVE_COUNTERS_FAILED');
  return (await response.json()) as {
    readonly server: number;
    readonly protected: number;
    readonly protectedCode: string | null;
  };
}

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

/** Runs the same genuine native approval assertions in live and isolated local browser qualification. */
export async function runLiveNativeApprovalScenario(
  page: Page,
  fixture: LiveBrowserFixture,
  endpoint: RoutedEndpoint,
): Promise<void> {
  const errors: string[] = [];
  const onError = (error: Error) => errors.push(error.message);
  page.on('pageerror', onError);
  try {
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
      return expectNativeRunCapture(capture);
    });
    const starts = events.filter((event) => event.type === 'TOOL_CALL_START');
    const results = events.filter((event) => event.type === 'TOOL_CALL_RESULT');
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
        starts[0].parentMessageId ?? `assistant-${before.members[0].call_id}`,
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
          starts[0].parentMessageId ?? `assistant-${before.members[0].call_id}`,
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
  } finally {
    page.off('pageerror', onError);
  }
}
