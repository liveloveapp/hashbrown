import { expect, test } from 'vitest';

import { executorWith, type MarkerHandler } from '../testing/fake-executor.ts';
import { publicDigest } from './canonical.ts';
import type { ObservationError } from './contracts.ts';
import { replayObservations } from './replay.ts';

const now = new Date('2026-10-21T12:00:00.000Z');
const operationId = '44444444-4444-4444-8444-444444444444';
const subjectId = '55555555-5555-4555-8555-555555555555';
const observationA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const observationB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const none = () => ({ rows: [] });
const subjectDigest = publicDigest({
  subject: subjectId,
  source: null,
  from: null,
  to: null,
  maxEvents: 10,
});

function replayHandlers(
  overrides: Record<string, MarkerHandler> = {},
): Record<string, MarkerHandler> {
  return {
    'observation-lock-operation': none,
    'observation-read-operation': none,
    'observation-select-replay': () => ({
      rows: [{ id: observationA }, { id: observationB }],
    }),
    'observation-lock-replay-work': none,
    'observation-reset-work': none,
    'observation-delete-facts': none,
    'observation-insert-operation': none,
    ...overrides,
  };
}

test('replay bumps generations, resets work, deletes facts, and is idempotent by operation id', async () => {
  const { executor, calls } = executorWith(replayHandlers());
  const ids = [observationA, observationB];

  const result = await replayObservations(
    executor,
    { operationId, subjectId, maxEvents: 10 },
    now,
  );

  expect(result).toEqual({ selectedCount: 2 });
  expect(calls.map((c) => c.marker)).toEqual([
    'observation-lock-operation',
    'observation-read-operation',
    'observation-select-replay',
    'observation-lock-replay-work',
    'observation-reset-work',
    'observation-delete-facts',
    'observation-insert-operation',
  ]);
  expect(calls[0].params).toEqual([`observation-operation:${operationId}`]);
  expect(calls[1].params).toEqual([operationId]);
  expect(calls[2].params).toEqual([subjectId, null, null, null, 11]);
  expect(calls[3].params).toEqual([ids]);
  expect(calls[3].sql).toContain('order by observation_id for update');
  expect(calls[4].params).toEqual([ids, now]);
  expect(calls[4].sql.replace(/\s+/gu, ' ')).toContain(
    "set generation=generation+1,status='pending',attempts=0,lease_token=null,lease_until=null,available_at=$2,updated_at=$2,last_error_code=null",
  );
  expect(calls[5].params).toEqual([ids]);
  expect(calls[6].params).toEqual([operationId, now, subjectDigest, 2]);
});

test('replay returns the recorded count for a repeated operation id without touching work', async () => {
  const { executor, calls } = executorWith(
    replayHandlers({
      'observation-read-operation': () => ({
        rows: [
          {
            kind: 'replay',
            selection_digest: subjectDigest,
            selected_count: 7,
          },
        ],
      }),
    }),
  );

  const result = await replayObservations(
    executor,
    { operationId, subjectId, maxEvents: 10 },
    now,
  );

  expect(result).toEqual({ selectedCount: 7 });
  expect(calls.map((c) => c.marker)).toEqual([
    'observation-lock-operation',
    'observation-read-operation',
  ]);
});

test('replay rejects a reused operation id with a different kind or selection', async () => {
  const rows = [
    { kind: 'redact', selection_digest: subjectDigest, selected_count: 1 },
    { kind: 'replay', selection_digest: 'other', selected_count: 1 },
  ];

  const codes = await Promise.all(
    rows.map((row) =>
      replayObservations(
        executorWith(
          replayHandlers({
            'observation-read-operation': () => ({ rows: [row] }),
          }),
        ).executor,
        { operationId, subjectId, maxEvents: 10 },
        now,
      ).catch((error: ObservationError) => error.code),
    ),
  );

  expect(codes).toEqual(['operation_conflict', 'operation_conflict']);
});

test('replay selects one extra row to detect selection overflow', async () => {
  const { executor, calls } = executorWith(replayHandlers());

  const code = await replayObservations(
    executor,
    { operationId, subjectId, maxEvents: 1 },
    now,
  ).catch((error: ObservationError) => error.code);

  expect(code).toBe('selection_overflow');
  expect(calls.at(-1)?.marker).toBe('observation-select-replay');
  expect(calls.at(-1)?.params[4]).toBe(2);
});

test('replay selects a source window and digests it', async () => {
  const from = new Date('2026-10-20T12:00:00.000Z');
  const to = new Date('2026-10-21T12:00:00.000Z');
  const { executor, calls } = executorWith(replayHandlers());

  await replayObservations(
    executor,
    { operationId, source: 'runtime', from, to, maxEvents: 10 },
    now,
  );

  expect(calls[2].params).toEqual([null, 'runtime', from, to, 11]);
  expect(calls[6].params[2]).toBe(
    publicDigest({
      subject: null,
      source: 'runtime',
      from: from.toISOString(),
      to: to.toISOString(),
      maxEvents: 10,
    }),
  );
});

test('replay rejects invalid selections before touching the store', async () => {
  const from = new Date('2026-10-20T12:00:00.000Z');
  const { executor, calls } = executorWith({});

  const codes = await Promise.all(
    [
      { operationId, subjectId, maxEvents: 0 },
      { operationId, subjectId, maxEvents: 1001 },
      { operationId, source: 'runtime' as const, from, to: from, maxEvents: 1 },
      {
        operationId,
        source: 'runtime' as const,
        from,
        to: new Date(from.getTime() + 86400001),
        maxEvents: 1,
      },
    ].map((selection) =>
      replayObservations(executor, selection, now).catch(
        (error: ObservationError) => error.code,
      ),
    ),
  );

  expect(codes).toEqual([
    'invalid_payload',
    'invalid_payload',
    'invalid_payload',
    'invalid_payload',
  ]);
  expect(calls).toEqual([]);
});
