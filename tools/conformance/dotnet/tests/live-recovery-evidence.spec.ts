import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertColdRecoveryEvidence,
  assertCompletedRecoveryInert,
  assertDeferredRecoveryPending,
  assertRecoveryProviderHistory,
  assertRecoveryRuntimeAdoption,
  type RecoveryCall,
  type RecoveryResult,
} from '../harness/live-recovery-evidence';

/** Synthetic validator control only; actual acceptance must collect these facts from workers, DB and browser. */
function coldControl() {
  const calls = [
    {
      id: 'browser-original',
      name: 'getWeather',
      arguments: { city: 'Paris' },
    },
    {
      id: 'server-original',
      name: 'lookupAirport',
      arguments: { code: 'PDX' },
    },
  ];
  const results = [
    {
      id: calls[0].id,
      result: { city: 'Paris', temperatureC: 21, condition: 'sunny' },
    },
    {
      id: calls[1].id,
      result: { code: 'PDX', name: 'Portland International Airport' },
    },
  ];
  return {
    schema: 'durable_live_' + 'a'.repeat(32),
    replacementSchema: 'durable_live_' + 'a'.repeat(32),
    original: {
      workerId: 'a',
      pid: 1001,
      loadedSha256: 'b'.repeat(64),
      drained: true,
      begunRuns: ['original-run'],
      disposedRuns: ['original-run'],
      attempts: 1,
      wireCalls: 1,
      completedCalls: 1,
      validUsageCalls: 1,
    },
    replacement: {
      workerId: 'b',
      pid: 1002,
      loadedSha256: 'b'.repeat(64),
      drained: true,
      begunRuns: ['continuation-run', 'follow-up-run'],
      disposedRuns: ['continuation-run', 'follow-up-run'],
      attempts: 2,
      wireCalls: 2,
      completedCalls: 2,
      validUsageCalls: 2,
    },
    pending: {
      disposition: 'Pending',
      schemaVersion: 2,
      serverRevision: 7,
      physicalRevision: 7,
      generation: 1,
      calls,
    },
    browser: {
      entries: 1,
      computations: 1,
      originalClosed: true,
      heldReadClosed: true,
      canonicalCallId: calls[0].id,
      result: results[0].result,
    },
    server: {
      originalEffects: 0,
      finalEffects: 1,
      originalDispatches: 0,
      capturedGeneration: 1,
      finalCapturedGeneration: 1,
      dispatchGeneration: 2,
      finalDispatches: 1,
      result: results[1].result,
    },
    settlement: {
      count: 1,
      revision: 7,
      callIds: [calls[0].id],
      result: results[0].result,
    },
    continuation: {
      calls,
      results,
      coldAcquisitions: 1,
      admittedRecoveryRuns: 1,
    },
    followUp: { calls, results },
    cleanup: {
      workers: true,
      browser: true,
      proxy: true,
      observer: true,
      schemaDrops: 1,
    },
    provenanceBefore: 'c'.repeat(64),
    provenanceAfter: 'c'.repeat(64),
  };
}

test('cold validator rejects same worker, reset schema, wrong package, missing drain and replay controls', () => {
  const valid = coldControl();
  const mutations = [
    (proof: typeof valid) => {
      proof.replacement.workerId = proof.original.workerId;
    },
    (proof: typeof valid) => {
      proof.replacement.pid = proof.original.pid;
    },
    (proof: typeof valid) => {
      proof.replacementSchema = 'durable_live_' + 'd'.repeat(32);
    },
    (proof: typeof valid) => {
      proof.replacement.loadedSha256 = 'e'.repeat(64);
    },
    (proof: typeof valid) => {
      proof.original.drained = false;
    },
    (proof: typeof valid) => {
      proof.original.disposedRuns = [];
    },
    (proof: typeof valid) => {
      proof.pending.schemaVersion = 1;
    },
    (proof: typeof valid) => {
      proof.pending.physicalRevision++;
    },
    (proof: typeof valid) => {
      proof.server.capturedGeneration++;
    },
    (proof: typeof valid) => {
      proof.server.finalCapturedGeneration++;
    },
    (proof: typeof valid) => {
      proof.server.dispatchGeneration = proof.server.capturedGeneration;
    },
    (proof: typeof valid) => {
      proof.browser.entries++;
    },
    (proof: typeof valid) => {
      proof.browser.computations++;
    },
    (proof: typeof valid) => {
      proof.browser.heldReadClosed = false;
    },
    (proof: typeof valid) => {
      proof.server.finalEffects++;
    },
    (proof: typeof valid) => {
      proof.server.finalDispatches++;
    },
    (proof: typeof valid) => {
      proof.settlement.count++;
    },
    (proof: typeof valid) => {
      proof.continuation.calls[0].id = 'reconstructed';
    },
    (proof: typeof valid) => {
      proof.continuation.results.push(proof.continuation.results[0]);
    },
    (proof: typeof valid) => {
      proof.followUp.results = [];
    },
    (proof: typeof valid) => {
      proof.replacement.attempts++;
    },
    (proof: typeof valid) => {
      proof.replacement.validUsageCalls--;
    },
    (proof: typeof valid) => {
      proof.cleanup.schemaDrops = 0;
    },
    (proof: typeof valid) => {
      proof.cleanup.observer = false;
    },
    (proof: typeof valid) => {
      proof.provenanceAfter = 'f'.repeat(64);
    },
  ];

  expect(() => assertColdRecoveryEvidence(valid)).not.toThrow();
  expect(() =>
    assertColdRecoveryEvidence(JSON.parse(JSON.stringify(valid))),
  ).not.toThrow();
  for (const mutate of mutations) {
    const proof = JSON.parse(JSON.stringify(valid));
    // JSON wire-value cloning separates every boundary without changing object realms.
    expect(() => assertColdRecoveryEvidence(proof)).not.toThrow();
    mutate(proof);

    expect(() => assertColdRecoveryEvidence(proof)).toThrow(
      'RECOVERY_EVIDENCE_INVALID',
    );
  }
});

test('Completed reread must preserve physical history, effects, provider work and actual consumed run events', () => {
  const before = {
    disposition: 'Completed',
    schemaVersion: 2,
    serverRevision: 8,
    canonicalHistorySha256: 'a'.repeat(64),
    physicalHistorySha256: 'a'.repeat(64),
    nativeHistorySha256: 'c'.repeat(64),
    attempts: 2,
    wireCalls: 2,
    effects: 1,
    browserEntries: 1,
    nativeRuns: ['initial', 'continued'],
    browserEvents: ['actual-start', 'actual-finish'],
  };

  expect(() =>
    assertCompletedRecoveryInert(before, JSON.parse(JSON.stringify(before))),
  ).not.toThrow();
  for (const after of [
    { ...before, attempts: 3 },
    { ...before, wireCalls: 3 },
    { ...before, effects: 2 },
    { ...before, browserEntries: 2 },
    { ...before, nativeRuns: [...before.nativeRuns, 'read-run'] },
    { ...before, browserEvents: [...before.browserEvents, 'TOOL_CALL_RESULT'] },
    { ...before, canonicalHistorySha256: 'b'.repeat(64) },
    { ...before, physicalHistorySha256: 'b'.repeat(64) },
    { ...before, nativeHistorySha256: 'd'.repeat(64) },
    { ...before, serverRevision: 9 },
    { ...before, disposition: 'Pending' },
  ])
    expect(() => assertCompletedRecoveryInert(before, after)).toThrow(
      'RECOVERY_COMPLETED_NOT_INERT',
    );
});

/** Mirrors the exact observed synthetic pending native snapshot; it grants no execution authority. */
function deferredControl() {
  const actual = JSON.parse(
    readFileSync(
      resolve(
        'tools/conformance/dotnet/tests/fixtures/live-recovery-pending-observation.json',
      ),
      'utf8',
    ),
  );
  const calls: { id: string; name: string; arguments: unknown }[] =
    actual.emitted;
  const messages = JSON.parse(actual.pending.payload.publicRequest).messages;
  return {
    emitted: calls,
    publicCalls: messages.flatMap(
      (message: {
        toolCalls?: {
          id: string;
          function: { name: string; arguments: string };
        }[];
      }) =>
        (message.toolCalls ?? []).map((call) => ({
          id: call.id,
          name: call.function.name,
          arguments: JSON.parse(call.function.arguments),
        })),
    ),
    publicResults: messages
      .filter((message: { role: string }) => message.role === 'tool')
      .map((message: { toolCallId: string; content: string }) => ({
        id: message.toolCallId,
        result: JSON.parse(message.content),
      })),
    generation: actual.pending.generation as number,
    payload: actual.pending.payload,
    invocations: actual.pending.invocations as {
      call_id: string;
      name: string;
      version: number;
      state: string;
      descriptor: string;
      captured_generation: number;
      dispatch_generation: number | null;
    }[],
    effects: actual.pending.effects as { count: number; rows: unknown[] },
  };
}

test('pending browser projection independently binds both genuine calls to a deferred native server descriptor', () => {
  const valid = deferredControl();
  const mutate = [
    (value: typeof valid) => {
      value.emitted.push(value.emitted[1]);
    },
    (value: typeof valid) => {
      value.emitted[1].id = 'wrong';
    },
    (value: typeof valid) => {
      value.publicCalls.push(value.emitted[1]);
    },
    (value: typeof valid) => {
      value.payload.expectedBrowserCallIds = [];
    },
    (value: typeof valid) => {
      value.payload.expectedBrowserCallIds.push(
        value.payload.expectedBrowserCallIds[0],
      );
    },
    (value: typeof valid) => {
      value.payload.turnCompleted = true;
    },
    (value: typeof valid) => {
      value.payload.pendingCalls = [];
    },
    (value: typeof valid) => {
      value.payload.pendingCalls.push(value.payload.pendingCalls[0]);
    },
    (value: typeof valid) => {
      value.payload.pendingCalls[0].id = 'wrong';
    },
    (value: typeof valid) => {
      value.invocations = [];
    },
    (value: typeof valid) => {
      value.invocations.push(value.invocations[0]);
    },
    (value: typeof valid) => {
      value.invocations[0].descriptor = JSON.stringify({
        ...value.payload.pendingCalls[0],
        arguments: { code: 'BAD' },
      });
    },
    (value: typeof valid) => {
      value.invocations[0].state = 'Completed';
    },
    (value: typeof valid) => {
      value.invocations[0].captured_generation = 2;
    },
    (value: typeof valid) => {
      value.invocations[0].dispatch_generation = 1;
    },
    (value: typeof valid) => {
      value.effects.count = 1;
    },
  ];

  expect(() => assertDeferredRecoveryPending(valid)).not.toThrow();
  for (const change of mutate) {
    const value = JSON.parse(JSON.stringify(valid));
    change(value);

    expect(() => assertDeferredRecoveryPending(value)).toThrow(
      'RECOVERY_PENDING_BINDING_INVALID',
    );
  }
});

for (const mutation of [
  'missing',
  'duplicate',
  'wrong-id',
  'wrong-arguments',
  'informational',
  'history-result',
] as const)
  test(`pending binding rejects an actual native bypass ${mutation} fault`, () => {
    const value = deferredControl();
    const native = JSON.parse(value.payload.nativeJson);
    const bypass = native.stateBag._bypassedInvocableFunctionCalls;
    if (mutation === 'missing') bypass.splice(0);
    if (mutation === 'duplicate') bypass.push({ ...bypass[0] });
    if (mutation === 'wrong-id') bypass[0].callId = 'wrong';
    if (mutation === 'wrong-arguments') bypass[0].arguments = { code: 'BAD' };
    if (mutation === 'informational') bypass[0].informationalOnly = true;
    if (mutation === 'history-result')
      native.stateBag.InMemoryChatHistoryProvider.messages.push({
        role: 'tool',
        contents: [
          { $type: 'functionResult', callId: bypass[0].callId, result: '{}' },
        ],
      });
    value.payload.nativeJson = JSON.stringify(native);

    expect(() => assertDeferredRecoveryPending(value)).toThrow(
      'RECOVERY_PENDING_BINDING_INVALID',
    );
  });

/** Independent native and transport fixtures preserve both original IDs and real semantic result bodies. */
function providerControl() {
  const calls = deferredControl().emitted;
  const results = [
    {
      id: calls[0].id,
      result: { city: 'Paris', temperatureC: 21, condition: 'sunny' },
    },
    {
      id: calls[1].id,
      result: { code: 'PDX', name: 'Portland International Airport' },
    },
  ];
  const messages: Record<string, unknown>[] = [
    { role: 'user', content: 'call both original tools' },
    {
      role: 'assistant',
      content: '',
      toolCalls: [
        {
          id: calls[0].id,
          function: {
            name: calls[0].name,
            arguments: JSON.stringify(calls[0].arguments),
          },
        },
      ],
    },
    {
      role: 'tool',
      toolCallId: calls[0].id,
      content: JSON.stringify(results[0].result),
    },
  ];
  const history: {
    role: string;
    text: string;
    calls: RecoveryCall[];
    results: RecoveryResult[];
  }[] = [
    { role: 'user', text: 'call both original tools', calls: [], results: [] },
    ...calls.flatMap((call, index) => [
      { role: 'assistant', text: '', calls: [call], results: [] },
      {
        role: 'tool',
        text: '',
        calls: [],
        results: [
          { id: call.id, result: JSON.stringify(results[index].result) },
        ],
      },
    ]),
  ];
  const input: Record<string, unknown>[] = [
    {
      role: 'user',
      type: 'message',
      content: [{ type: 'input_text', text: 'call both original tools' }],
    },
    ...calls.flatMap((call, index) => [
      {
        type: 'function_call',
        call_id: call.id,
        name: call.name,
        arguments: JSON.stringify(call.arguments),
      },
      {
        type: 'function_call_output',
        call_id: call.id,
        output: JSON.stringify(results[index].result),
      },
    ]),
  ];
  return {
    calls,
    results,
    messages,
    observation: { history, wire: { input } },
  };
}

test('provider proof retains both independently captured native calls and results despite browser-only recovery transport', () => {
  const value = providerControl();

  expect(() =>
    assertRecoveryProviderHistory(
      value.observation,
      value.messages,
      value.calls,
      value.results,
    ),
  ).not.toThrow();
  expect(value.messages[1].toolCalls).toHaveLength(1);
  expect(
    value.observation.history.flatMap((message) => message.calls),
  ).toHaveLength(2);
});

for (const mutation of [
  'missing-call',
  'duplicate-call',
  'wrong-call',
  'missing-result',
  'duplicate-result',
  'wrong-result',
  'extra-text',
  'reordered-pairs',
  'native-missing-call',
  'native-wrong-result',
] as const)
  test(`provider proof rejects ${mutation} without dropping a native/public crosscheck`, () => {
    const value = providerControl();
    const input = value.observation.wire.input;
    if (mutation === 'missing-call') input.splice(3, 1);
    if (mutation === 'duplicate-call') input.push({ ...input[3] });
    if (mutation === 'wrong-call') input[3] = { ...input[3], call_id: 'wrong' };
    if (mutation === 'missing-result') input.splice(4, 1);
    if (mutation === 'duplicate-result') input.push({ ...input[4] });
    if (mutation === 'wrong-result')
      input[4] = { ...input[4], output: '{"code":"BAD"}' };
    if (mutation === 'extra-text')
      input.unshift({
        role: 'user',
        type: 'message',
        content: [{ type: 'input_text', text: 'unobserved text' }],
      });
    if (mutation === 'reordered-pairs')
      input.splice(1, 4, ...[...input.slice(3), ...input.slice(1, 3)]);
    if (mutation === 'native-missing-call')
      value.observation.history.splice(3, 1);
    if (mutation === 'native-wrong-result')
      value.observation.history[4].results[0] = {
        ...value.observation.history[4].results[0],
        result: '{"code":"BAD"}',
      };

    expect(() =>
      assertRecoveryProviderHistory(
        value.observation,
        value.messages,
        value.calls,
        value.results,
      ),
    ).toThrow();
  });

test('legal browser-first provider projection preserves identities even when genuine initial native emission was server-first', () => {
  const value = providerControl();
  value.calls.reverse();

  expect(() =>
    assertRecoveryProviderHistory(
      value.observation,
      value.messages,
      value.calls,
      value.results,
    ),
  ).not.toThrow();
});

for (const content of ['', [], [{ type: 'input_text', text: '' }]])
  test(`provider proof rejects an unexpected empty user message ${JSON.stringify(content)}`, () => {
    const value = providerControl();
    value.observation.wire.input.unshift({
      type: 'message',
      role: 'user',
      content,
    });

    expect(() =>
      assertRecoveryProviderHistory(
        value.observation,
        value.messages,
        value.calls,
        value.results,
      ),
    ).toThrow('RECOVERY_PROVIDER_HISTORY_INVALID');
  });

/** Loads a jointly captured synthetic runtime/canonical pair; original call descriptors are a separate validator input. */
function runtimeAdoptionControl() {
  const recorded = JSON.parse(
    readFileSync(
      resolve(
        'tools/conformance/dotnet/tests/fixtures/live-recovery-runtime-adoption.json',
      ),
      'utf8',
    ),
  );
  return {
    runtime: recorded.runtime,
    canonical: recorded.canonical,
    originalCalls: [
      {
        id: 'control-browser-1',
        name: 'getWeather',
        arguments: { city: 'Paris' },
      },
      {
        id: 'control-server-1',
        name: 'lookupAirport',
        arguments: { code: 'PDX' },
      },
    ],
  };
}

test('Completed adoption preserves the complete runtime view across browser result folding and server display projection', () => {
  const value = runtimeAdoptionControl();
  const before = JSON.stringify(value);

  expect(() =>
    assertRecoveryRuntimeAdoption(
      value.runtime,
      value.canonical,
      value.originalCalls,
    ),
  ).not.toThrow();

  expect(JSON.stringify(value)).toBe(before);
  expect(value.runtime).toHaveLength(4);
  expect(value.canonical).toHaveLength(7);
});

for (const mutation of [
  'missing-user',
  'duplicate-message',
  'wrong-message-id',
  'wrong-role',
  'wrong-user-text',
  'wrong-assistant-text',
  'message-order',
  'raw-system-leak',
  'raw-result-leak',
  'extra-runtime-field',
  'missing-browser',
  'duplicate-browser',
  'wrong-browser-id',
  'wrong-browser-name',
  'wrong-browser-args',
  'wrong-browser-result',
  'wrong-browser-status',
  'rejected-browser',
  'missing-server',
  'duplicate-server',
  'wrong-server-id',
  'wrong-server-name',
  'wrong-server-args',
  'wrong-server-result',
  'wrong-server-status',
  'rejected-server',
  'server-as-browser',
  'browser-as-server',
  'extra-call-field',
  'result-formatting-change',
] as const)
  test(`Completed runtime proof rejects ${mutation} instead of dropping visible state`, () => {
    const value = runtimeAdoptionControl();
    const browser = value.runtime[1].toolCalls[0];
    const server = value.runtime[2].serverToolCalls[0];
    if (mutation === 'missing-user') value.runtime.splice(0, 1);
    if (mutation === 'duplicate-message')
      value.runtime.push({ ...value.runtime[1] });
    if (mutation === 'wrong-message-id') value.runtime[1].id = 'wrong';
    if (mutation === 'wrong-role') value.runtime[0].role = 'assistant';
    if (mutation === 'wrong-user-text') value.runtime[0].content += ' changed';
    if (mutation === 'wrong-assistant-text')
      value.runtime[3].content += ' changed';
    if (mutation === 'message-order') value.runtime.reverse();
    if (mutation === 'raw-system-leak')
      value.runtime.unshift({ ...value.canonical[0] });
    if (mutation === 'raw-result-leak')
      value.runtime.push({ ...value.canonical[3] });
    if (mutation === 'extra-runtime-field')
      value.runtime[3].metadata = { unexpected: true };
    if (mutation === 'missing-browser') value.runtime[1].toolCalls = [];
    if (mutation === 'duplicate-browser')
      value.runtime[1].toolCalls.push({ ...browser });
    if (mutation === 'wrong-browser-id') browser.toolCallId = 'wrong';
    if (mutation === 'wrong-browser-name') browser.name = 'wrong';
    if (mutation === 'wrong-browser-args') browser.args = { city: 'BAD' };
    if (mutation === 'wrong-browser-result')
      browser.result.value = '{"city":"BAD"}';
    if (mutation === 'wrong-browser-status') browser.status = 'pending';
    if (mutation === 'rejected-browser')
      browser.result = { status: 'rejected', reason: 'wrong' };
    if (mutation === 'missing-server') value.runtime[2].serverToolCalls = [];
    if (mutation === 'duplicate-server')
      value.runtime[2].serverToolCalls.push({ ...server });
    if (mutation === 'wrong-server-id') server.toolCallId = 'wrong';
    if (mutation === 'wrong-server-name') server.name = 'wrong';
    if (mutation === 'wrong-server-args') server.args = { code: 'BAD' };
    if (mutation === 'wrong-server-result')
      server.result.value = '{"code":"BAD"}';
    if (mutation === 'wrong-server-status') server.status = 'executing';
    if (mutation === 'rejected-server')
      server.result = { status: 'rejected', reason: 'wrong' };
    if (mutation === 'server-as-browser') {
      value.runtime[2].toolCalls = [server];
      delete value.runtime[2].serverToolCalls;
    }
    if (mutation === 'browser-as-server') {
      value.runtime[1].serverToolCalls = [browser];
      value.runtime[1].toolCalls = [];
    }
    if (mutation === 'extra-call-field') browser.error = 'unexpected';
    if (mutation === 'result-formatting-change')
      server.result.value = JSON.stringify(JSON.parse(server.result.value));

    expect(() =>
      assertRecoveryRuntimeAdoption(
        value.runtime,
        value.canonical,
        value.originalCalls,
      ),
    ).toThrow('RECOVERY_RUNTIME_ADOPTION_INVALID');
  });

for (const mutation of [
  'missing-call',
  'duplicate-call',
  'missing-result',
  'duplicate-result',
  'orphan-result',
  'wrong-call',
  'wrong-result',
  'duplicate-id',
  'unsupported-metadata',
] as const)
  test(`runtime oracle refuses an unsupported canonical ${mutation} rather than normalizing it away`, () => {
    const value = runtimeAdoptionControl();
    if (mutation === 'missing-call') value.canonical[4].toolCalls = [];
    if (mutation === 'duplicate-call')
      value.canonical[4].toolCalls.push({ ...value.canonical[4].toolCalls[0] });
    if (mutation === 'missing-result') value.canonical.splice(5, 1);
    if (mutation === 'duplicate-result')
      value.canonical.push({ ...value.canonical[5], id: 'extra-result' });
    if (mutation === 'orphan-result') value.canonical[5].toolCallId = 'orphan';
    if (mutation === 'wrong-call')
      value.canonical[4].toolCalls[0].function.name = 'wrong';
    if (mutation === 'wrong-result')
      value.canonical[5].content = '{"code":"BAD"}';
    if (mutation === 'duplicate-id')
      value.canonical[5].id = value.canonical[3].id;
    if (mutation === 'unsupported-metadata')
      value.canonical[4].metadata = { unsupported: true };

    expect(() =>
      assertRecoveryRuntimeAdoption(
        value.runtime,
        value.canonical,
        value.originalCalls,
      ),
    ).toThrow('RECOVERY_RUNTIME_ADOPTION_INVALID');
  });
