import * as assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  RELEASE_RECOVERY_MANIFEST,
  releaseRecoveryCases,
} from './live-recovery-manifest';

/** Actual native call binding, collected from the provider and canonical durable history. */
export interface RecoveryCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: unknown;
}
/** Actual native result binding, collected independently at each evidence boundary. */
export interface RecoveryResult {
  readonly id: string;
  readonly result: unknown;
}
/** One genuine worker's acquisition, lifecycle, usage and loaded-byte witnesses. */
export interface RecoveryWorkerEvidence {
  readonly workerId: string;
  readonly pid: number;
  readonly loadedSha256: string;
  readonly drained: boolean;
  readonly begunRuns: readonly string[];
  readonly disposedRuns: readonly string[];
  readonly attempts: number;
  readonly wireCalls: number;
  readonly completedCalls: number;
  readonly validUsageCalls: number;
}
/** Independent physical, browser, native and package witnesses for one completed cold journey. */
export interface ColdRecoveryEvidence {
  readonly schema: string;
  readonly replacementSchema: string;
  readonly original: RecoveryWorkerEvidence;
  readonly replacement: RecoveryWorkerEvidence;
  readonly pending: {
    readonly disposition: string;
    readonly schemaVersion: number;
    readonly serverRevision: number;
    readonly physicalRevision: number;
    readonly generation: number;
    readonly calls: readonly RecoveryCall[];
  };
  readonly browser: {
    readonly entries: number;
    readonly computations: number;
    readonly originalClosed: boolean;
    readonly heldReadClosed: boolean;
    readonly canonicalCallId: string;
    readonly result: unknown;
  };
  readonly server: {
    readonly originalEffects: number;
    readonly finalEffects: number;
    readonly originalDispatches: number;
    readonly capturedGeneration: number;
    readonly finalCapturedGeneration: number;
    readonly dispatchGeneration: number;
    readonly finalDispatches: number;
    readonly result: unknown;
  };
  readonly settlement: {
    readonly count: number;
    readonly revision: number;
    readonly callIds: readonly string[];
    readonly result: unknown;
  };
  readonly continuation: {
    readonly calls: readonly RecoveryCall[];
    readonly results: readonly RecoveryResult[];
    readonly coldAcquisitions: number;
    readonly admittedRecoveryRuns: number;
  };
  readonly followUp: {
    readonly calls: readonly RecoveryCall[];
    readonly results: readonly RecoveryResult[];
  };
  readonly cleanup: {
    readonly workers: boolean;
    readonly browser: boolean;
    readonly proxy: boolean;
    readonly observer: boolean;
    readonly schemaDrops: number;
  };
  readonly provenanceBefore: string;
  readonly provenanceAfter: string;
}

/** Canonical JSON comparison for supported plain observations; never used to alter provider input. */
export function recoveryJson(value: unknown): string {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    return JSON.stringify(value);
  if (Array.isArray(value))
    return '[' + value.map(recoveryJson).join(',') + ']';
  if (
    value &&
    typeof value === 'object' &&
    Object.getPrototypeOf(value) === Object.prototype
  )
    return (
      '{' +
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => JSON.stringify(key) + ':' + recoveryJson(item))
        .join(',') +
      '}'
    );
  throw new Error('RECOVERY_PLAIN_JSON_REQUIRED');
}

/** Independent pending-domain witnesses; private native state remains read-only test evidence. */
export interface DeferredRecoveryPendingObservation {
  readonly emitted: readonly RecoveryCall[];
  readonly publicCalls: readonly RecoveryCall[];
  readonly publicResults: readonly RecoveryResult[];
  readonly generation: number;
  readonly payload: Readonly<{
    formatVersion: number;
    nativeJson: string;
    publicRequest: string;
    pendingCalls: readonly unknown[];
    expectedBrowserCallIds: readonly string[];
    turnCompleted: boolean;
    approvals: Readonly<{ pendingBatch: unknown }>;
  }>;
  readonly invocations: readonly Readonly<Record<string, unknown>>[];
  readonly effects: Readonly<{ count: number; rows: readonly unknown[] }>;
}

/** Binds a visible browser call and deferred server work to the exact genuine two-call native emission. */
export function assertDeferredRecoveryPending(
  value: DeferredRecoveryPendingObservation,
): void {
  try {
    assert.equal(value.emitted.length, 2);
    assert.equal(new Set(value.emitted.map((call) => call.id)).size, 2);
    const browser = value.emitted.find((call) => call.name === 'getWeather');
    const server = value.emitted.find((call) => call.name === 'lookupAirport');
    assert.ok(browser?.id && server?.id);
    assert.deepEqual(browser.arguments, { city: 'Paris' });
    assert.deepEqual(server.arguments, { code: 'PDX' });
    assert.equal(recoveryJson(value.publicCalls), recoveryJson([browser]));
    assert.deepEqual(value.publicResults, []);
    assert.equal(value.payload.formatVersion, 2);
    assert.deepEqual(value.payload.expectedBrowserCallIds, [browser.id]);
    assert.equal(value.payload.turnCompleted, false);
    assert.deepEqual(value.payload.approvals, { pendingBatch: null });
    const descriptor = {
      id: server.id,
      name: server.name,
      version: 1,
      arguments: server.arguments,
    };
    assert.equal(
      recoveryJson(value.payload.pendingCalls),
      recoveryJson([descriptor]),
    );
    const native = JSON.parse(value.payload.nativeJson);
    assert.deepEqual(Object.keys(native).sort(), ['stateBag']);
    assert.deepEqual(Object.keys(native.stateBag).sort(), [
      'InMemoryChatHistoryProvider',
      '_bypassedInvocableFunctionCalls',
    ]);
    assert.equal(
      recoveryJson(native.stateBag._bypassedInvocableFunctionCalls),
      recoveryJson([
        {
          name: server.name,
          arguments: server.arguments,
          informationalOnly: false,
          callId: server.id,
        },
      ]),
    );
    assert.deepEqual(native.stateBag.InMemoryChatHistoryProvider, {
      messages: [],
    });
    assert.ok(Number.isSafeInteger(value.generation) && value.generation > 0);
    assert.equal(value.invocations.length, 1);
    const captured = value.invocations[0];
    assert.equal(captured.call_id, server.id);
    assert.equal(captured.name, server.name);
    assert.equal(captured.version, 1);
    assert.equal(captured.state, 'Captured');
    assert.equal(captured.captured_generation, value.generation);
    assert.equal(captured.dispatch_generation, null);
    assert.equal(typeof captured.descriptor, 'string');
    assert.equal(
      recoveryJson(JSON.parse(captured.descriptor as string)),
      recoveryJson(descriptor),
    );
    assert.deepEqual(value.effects, { count: 0, rows: [] });
  } catch {
    throw new Error('RECOVERY_PENDING_BINDING_INVALID');
  }
}

/** Genuine passive native input and wire input, retaining every call and result without deduplication. */
export interface RecoveryProviderObservation {
  readonly history: readonly Readonly<{
    role: string;
    text: string;
    calls: readonly RecoveryCall[];
    results: readonly RecoveryResult[];
  }>[];
  readonly wire: null | Readonly<{
    input: readonly Readonly<Record<string, unknown>>[];
  }>;
}

/** Normalizes one supported native function-result encoding without recursively interpreting user or result strings. */
export function recoveryNativeResults(
  history: RecoveryProviderObservation['history'],
): readonly RecoveryResult[] {
  return history.flatMap((message) =>
    message.results.map((result) => ({
      id: result.id,
      result:
        typeof result.result === 'string'
          ? JSON.parse(result.result)
          : result.result,
    })),
  );
}

/** Requires full native/wire two-call evidence while respecting the native browser-first, deferred-server projection. */
export function assertRecoveryProviderHistory(
  observation: RecoveryProviderObservation,
  publicMessages: readonly Record<string, unknown>[],
  originalCalls: readonly RecoveryCall[],
  expectedResults: readonly RecoveryResult[],
): void {
  type Atom = Readonly<
    | { kind: 'text'; role: string; text: string }
    | { kind: 'call' | 'result'; id: string }
  >;
  let wireResults: readonly RecoveryResult[];
  let nativeResults: readonly RecoveryResult[];
  try {
    assert.ok(observation.wire);
    assert.equal(originalCalls.length, 2);
    assert.equal(new Set(originalCalls.map((call) => call.id)).size, 2);
    const browser = originalCalls.find((call) => call.name === 'getWeather');
    const server = originalCalls.find((call) => call.name === 'lookupAirport');
    assert.ok(browser && server);
    const providerCalls = [browser, server];
    const publicCalls = publicMessages.flatMap((message) =>
      Array.isArray(message.toolCalls)
        ? message.toolCalls.map((call) => ({
            id: String(call.id),
            name: String(call.function.name),
            arguments: JSON.parse(call.function.arguments),
          }))
        : [],
    );
    const pending = publicCalls.length === 1;
    assert.equal(
      recoveryJson(publicCalls),
      recoveryJson(pending ? [browser] : providerCalls),
    );
    const expected: Atom[] = [];
    for (const message of publicMessages) {
      if (
        ['system', 'user', 'assistant'].includes(String(message.role)) &&
        typeof message.content === 'string' &&
        message.content.length > 0
      )
        expected.push({
          kind: 'text',
          role: String(message.role),
          text: message.content,
        });
      if (Array.isArray(message.toolCalls))
        for (const call of message.toolCalls) {
          expected.push(
            { kind: 'call', id: String(call.id) },
            { kind: 'result', id: String(call.id) },
          );
          // This is an independent expected-position assertion from the genuine original server descriptor.
          // It never modifies the transport, provider input, native state or SDK updates.
          if (pending)
            expected.push(
              { kind: 'call', id: server.id },
              { kind: 'result', id: server.id },
            );
        }
    }
    const wireAtoms: Atom[] = [];
    const wireCalls: RecoveryCall[] = [];
    const outputs: RecoveryResult[] = [];
    for (const item of observation.wire.input) {
      if (item.type === 'function_call') {
        assert.ok(
          typeof item.call_id === 'string' &&
            typeof item.name === 'string' &&
            typeof item.arguments === 'string',
        );
        wireCalls.push({
          id: item.call_id,
          name: item.name,
          arguments: JSON.parse(item.arguments),
        });
        wireAtoms.push({ kind: 'call', id: item.call_id });
      } else if (item.type === 'function_call_output') {
        assert.ok(
          typeof item.call_id === 'string' && typeof item.output === 'string',
        );
        outputs.push({ id: item.call_id, result: JSON.parse(item.output) });
        wireAtoms.push({ kind: 'result', id: item.call_id });
      } else {
        assert.ok(item.type === undefined || item.type === 'message');
        assert.ok(['system', 'user', 'assistant'].includes(String(item.role)));
        let text = '';
        if (typeof item.content === 'string') text = item.content;
        else {
          assert.ok(Array.isArray(item.content));
          for (const part of item.content) {
            assert.equal(
              part.type,
              item.role === 'assistant' ? 'output_text' : 'input_text',
            );
            assert.equal(typeof part.text, 'string');
            text += part.text;
          }
        }
        assert.ok(
          text.length > 0,
          'Provider history text message must not be empty',
        );
        wireAtoms.push({ kind: 'text', role: String(item.role), text });
      }
    }
    assert.equal(recoveryJson(wireCalls), recoveryJson(providerCalls));
    assert.equal(
      recoveryJson(observation.history.flatMap((message) => message.calls)),
      recoveryJson(providerCalls),
    );
    const nativeAtoms: Atom[] = observation.history.flatMap((message) => [
      ...(message.role !== 'tool' && message.text?.length
        ? [{ kind: 'text' as const, role: message.role, text: message.text }]
        : []),
      ...message.calls.map((call) => ({ kind: 'call' as const, id: call.id })),
      ...message.results.map((result) => ({
        kind: 'result' as const,
        id: result.id,
      })),
    ]);
    assert.equal(recoveryJson(wireAtoms), recoveryJson(expected));
    assert.equal(recoveryJson(nativeAtoms), recoveryJson(expected));
    wireResults = outputs;
    nativeResults = recoveryNativeResults(observation.history);
    assert.equal(expectedResults.length, 2);
    assert.equal(new Set(expectedResults.map((result) => result.id)).size, 2);
    const ids = providerCalls.map((call) => call.id);
    assert.deepEqual(
      wireResults.map((result) => result.id),
      ids,
    );
    assert.deepEqual(
      nativeResults.map((result) => result.id),
      ids,
    );
    assert.ok(
      ids.every((id) => expectedResults.some((result) => result.id === id)),
    );
  } catch {
    throw new Error('RECOVERY_PROVIDER_HISTORY_INVALID');
  }
  const expected = [...expectedResults].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  for (const actual of [wireResults, nativeResults])
    if (
      recoveryJson(
        [...actual].sort((left, right) => left.id.localeCompare(right.id)),
      ) !== recoveryJson(expected)
    )
      throw new Error('RECOVERY_RESULT_BINDING_INVALID');
}

/** Computes only a digest for allowlisted persisted diagnostics; raw contents stay bounded in parent memory. */
export function recoveryDigest(value: unknown): string {
  return createHash('sha256').update(recoveryJson(value)).digest('hex');
}

/** Requires independent cross-worker and no-replay witnesses before accepting a cold journey. */
export function assertColdRecoveryEvidence(value: ColdRecoveryEvidence): void {
  try {
    const proof = value;
    const hex = (text: string) => /^[a-f0-9]{64}$/.test(text);
    assert.match(proof.schema, /^durable_live_[a-f0-9]{32}$/);
    assert.equal(proof.schema, proof.replacementSchema);
    assert.notEqual(proof.original.workerId, proof.replacement.workerId);
    assert.notEqual(proof.original.pid, proof.replacement.pid);
    assert.ok(hex(proof.original.loadedSha256));
    assert.equal(proof.original.loadedSha256, proof.replacement.loadedSha256);
    for (const [worker, calls] of [
      [proof.original, 1],
      [proof.replacement, 2],
    ] as const) {
      assert.ok(
        worker.workerId && Number.isSafeInteger(worker.pid) && worker.pid > 0,
      );
      assert.equal(worker.drained, true);
      assert.equal(worker.attempts, calls);
      assert.equal(worker.wireCalls, calls);
      assert.equal(worker.completedCalls, calls);
      assert.equal(worker.validUsageCalls, calls);
      assert.equal(new Set(worker.begunRuns).size, calls);
      assert.deepEqual(
        [...worker.begunRuns].sort(),
        [...worker.disposedRuns].sort(),
      );
    }
    assert.equal(proof.pending.disposition, 'Pending');
    assert.equal(proof.pending.schemaVersion, 2);
    assert.ok(
      Number.isSafeInteger(proof.pending.serverRevision) &&
        proof.pending.serverRevision > 0,
    );
    assert.equal(proof.pending.serverRevision, proof.pending.physicalRevision);
    const calls = proof.pending.calls;
    assert.equal(calls.length, 2);
    assert.equal(new Set(calls.map((call) => call.id)).size, 2);
    assert.deepEqual(calls.map((call) => call.name).sort(), [
      'getWeather',
      'lookupAirport',
    ]);
    const browser = calls.find((call) => call.name === 'getWeather')!;
    const server = calls.find((call) => call.name === 'lookupAirport')!;
    assert.deepEqual(browser.arguments, { city: 'Paris' });
    assert.deepEqual(server.arguments, { code: 'PDX' });
    assert.equal(proof.browser.entries, 1);
    assert.equal(proof.browser.computations, 1);
    assert.equal(proof.browser.originalClosed, true);
    assert.equal(proof.browser.heldReadClosed, true);
    assert.equal(proof.browser.canonicalCallId, browser.id);
    assert.deepEqual(proof.browser.result, {
      city: 'Paris',
      temperatureC: 21,
      condition: 'sunny',
    });
    assert.deepEqual(proof.server.result, {
      code: 'PDX',
      name: 'Portland International Airport',
    });
    assert.equal(proof.server.originalEffects, 0);
    assert.equal(proof.server.finalEffects, 1);
    assert.equal(proof.server.originalDispatches, 0);
    assert.ok(
      Number.isSafeInteger(proof.pending.generation) &&
        proof.pending.generation > 0,
    );
    assert.equal(proof.server.capturedGeneration, proof.pending.generation);
    assert.equal(
      proof.server.finalCapturedGeneration,
      proof.server.capturedGeneration,
    );
    assert.equal(proof.server.dispatchGeneration, proof.pending.generation + 1);
    assert.equal(proof.server.finalDispatches, 1);
    assert.equal(proof.settlement.count, 1);
    assert.equal(proof.settlement.revision, proof.pending.serverRevision);
    assert.deepEqual(proof.settlement.callIds, [browser.id]);
    assert.deepEqual(proof.settlement.result, proof.browser.result);
    assert.equal(proof.continuation.coldAcquisitions, 1);
    assert.equal(proof.continuation.admittedRecoveryRuns, 1);
    for (const history of [proof.continuation, proof.followUp]) {
      assert.equal(
        recoveryJson(history.calls),
        recoveryJson([browser, server]),
      );
      assert.equal(history.results.length, 2);
      assert.equal(new Set(history.results.map((result) => result.id)).size, 2);
      assert.deepEqual(
        history.results.find((result) => result.id === browser.id)?.result,
        proof.browser.result,
      );
      assert.deepEqual(
        history.results.find((result) => result.id === server.id)?.result,
        proof.server.result,
      );
    }
    for (const cleaned of [
      proof.cleanup.workers,
      proof.cleanup.browser,
      proof.cleanup.proxy,
      proof.cleanup.observer,
    ])
      assert.equal(cleaned, true);
    assert.equal(proof.cleanup.schemaDrops, 1);
    assert.ok(hex(proof.provenanceBefore));
    assert.equal(proof.provenanceBefore, proof.provenanceAfter);
  } catch {
    throw new Error('RECOVERY_EVIDENCE_INVALID');
  }
}

/** Independently verifies the public runtime view without invoking a workspace SDK converter. */
export function assertRecoveryRuntimeAdoption(
  runtime: readonly Record<string, unknown>[],
  canonical: readonly Record<string, unknown>[],
  originalCalls: readonly RecoveryCall[],
): void {
  try {
    const keys = (value: Record<string, unknown>, allowed: readonly string[]) =>
      assert.ok(
        Object.keys(value).every((key) => allowed.includes(key)),
        'Unsupported release-profile message field',
      );
    const identifier = (value: unknown): string => {
      assert.ok(typeof value === 'string' && value.length > 0);
      return value;
    };
    assert.ok(Array.isArray(runtime) && Array.isArray(canonical));
    assert.equal(originalCalls.length, 2);
    assert.equal(new Set(originalCalls.map((call) => call.id)).size, 2);
    const browser = originalCalls.find((call) => call.name === 'getWeather');
    const server = originalCalls.find((call) => call.name === 'lookupAirport');
    assert.ok(browser && server);
    assert.deepEqual(browser.arguments, { city: 'Paris' });
    assert.deepEqual(server.arguments, { code: 'PDX' });
    const results = new Map<string, string>();
    const messageIds = new Set<string>();
    for (const message of canonical) {
      const id = identifier(message.id);
      assert.ok(!messageIds.has(id));
      messageIds.add(id);
      assert.equal(typeof message.content, 'string');
      if (message.role === 'tool') {
        keys(message, ['id', 'role', 'content', 'toolCallId']);
        const callId = identifier(message.toolCallId);
        assert.ok(!results.has(callId));
        results.set(callId, message.content as string);
      }
    }
    assert.equal(results.size, 2);
    assert.deepEqual(JSON.parse(results.get(browser.id)!), {
      city: 'Paris',
      temperatureC: 21,
      condition: 'sunny',
    });
    assert.deepEqual(JSON.parse(results.get(server.id)!), {
      code: 'PDX',
      name: 'Portland International Airport',
    });
    const expected: Record<string, unknown>[] = [];
    const calls: RecoveryCall[] = [];
    for (const message of canonical) {
      if (message.role === 'system') {
        keys(message, ['id', 'role', 'content']);
        // System input remains in the independently checked raw envelope, not the public runtime view.
        continue;
      }
      if (message.role === 'tool') continue; // Every exact result string is folded into its original call below.
      if (message.role === 'user') {
        keys(message, ['id', 'role', 'content']);
        expected.push({
          id: message.id,
          role: 'user',
          content: message.content,
        });
        continue;
      }
      assert.equal(message.role, 'assistant');
      keys(message, ['id', 'role', 'content', 'name', 'toolCalls']);
      if (message.name !== undefined) identifier(message.name);
      const exposed: Record<string, unknown>[] = [];
      const serverCalls: Record<string, unknown>[] = [];
      assert.ok(
        message.toolCalls === undefined || Array.isArray(message.toolCalls),
      );
      for (const call of message.toolCalls ?? []) {
        keys(call, ['id', 'type', 'function']);
        assert.equal(call.type, 'function');
        assert.ok(
          call.function &&
            typeof call.function === 'object' &&
            !Array.isArray(call.function),
        );
        keys(call.function, ['name', 'arguments']);
        const id = identifier(call.id);
        const name = identifier(call.function.name);
        assert.equal(typeof call.function.arguments, 'string');
        const args = JSON.parse(call.function.arguments);
        const original = originalCalls.find((item) => item.id === id);
        assert.ok(original && results.has(id));
        assert.equal(name, original.name);
        assert.equal(recoveryJson(args), recoveryJson(original.arguments));
        calls.push({ id, name, arguments: args });
        const result = { status: 'fulfilled', value: results.get(id) };
        if (name === 'getWeather')
          exposed.push({
            role: 'tool',
            status: 'done',
            name,
            toolCallId: id,
            args,
            result,
          });
        else {
          assert.equal(name, 'lookupAirport');
          serverCalls.push({
            toolCallId: id,
            name,
            status: 'complete',
            args,
            result,
          });
        }
      }
      expected.push({
        id: message.id,
        role: 'assistant',
        content: message.content,
        ...(serverCalls.length ? { serverToolCalls: serverCalls } : {}),
        toolCalls: exposed,
      });
    }
    assert.equal(recoveryJson(calls), recoveryJson([browser, server]));
    assert.deepEqual(runtime, expected);
  } catch {
    throw new Error('RECOVERY_RUNTIME_ADOPTION_INVALID');
  }
}

/** Counters and physical/canonical identities observed around an authenticated Completed read. */
export interface CompletedRecoveryObservation {
  readonly disposition: string;
  readonly schemaVersion: number;
  readonly serverRevision: number;
  readonly canonicalHistorySha256: string;
  readonly physicalHistorySha256: string;
  readonly nativeHistorySha256: string;
  readonly attempts: number;
  readonly wireCalls: number;
  readonly effects: number;
  readonly browserEntries: number;
  readonly nativeRuns: readonly string[];
  readonly browserEvents: readonly string[];
}

/** Rejects any recovery read that changes native work, effects, canonical history or consumed run events. */
export function assertCompletedRecoveryInert(
  before: CompletedRecoveryObservation,
  after: CompletedRecoveryObservation,
): void {
  try {
    assert.equal(before.disposition, 'Completed');
    assert.equal(before.schemaVersion, 2);
    assert.match(before.canonicalHistorySha256, /^[a-f0-9]{64}$/);
    assert.equal(before.canonicalHistorySha256, before.physicalHistorySha256);
    assert.match(before.nativeHistorySha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(after, before);
  } catch {
    throw new Error('RECOVERY_COMPLETED_NOT_INERT');
  }
}

/** Records exact case membership and all preflights, rejecting duplicated or incomplete reports. */
export function createReleaseRecoveryLedger() {
  const cases = new Set<string>();
  const preflights = new Set<string>();
  let invalid = false;
  const reject = () => {
    invalid = true;
    throw new Error('RECOVERY_LEDGER_INVALID');
  };
  return Object.freeze({
    case: (id: string) => {
      if (
        !releaseRecoveryCases().some((item) => item.id === id) ||
        cases.has(id)
      )
        reject();
      cases.add(id);
    },
    preflight: (id: string) => {
      if (
        !RELEASE_RECOVERY_MANIFEST.preflights.includes(id) ||
        preflights.has(id)
      )
        reject();
      preflights.add(id);
    },
    fail: () => {
      invalid = true;
    },
    assertComplete: () => {
      if (invalid || cases.size !== 12 || preflights.size !== 3)
        throw new Error('RECOVERY_QUALIFICATION_INCOMPLETE');
    },
    snapshot: () =>
      Object.freeze({
        cases: cases.size,
        preflights: preflights.size,
        invalid,
      }),
  });
}
