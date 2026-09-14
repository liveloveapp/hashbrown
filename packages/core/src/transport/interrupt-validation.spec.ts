import type { PendingInterruptBatch, ResumeOptions } from '../models/interrupt';
import {
  assertInterruptsNotExpired,
  validateInterruptOutcome,
  validateResumeOptions,
} from './interrupt-validation';

test('owns and recursively freezes every supported interrupt field', () => {
  const interrupt = {
    id: 'approval',
    reason: 'custom_reason',
    message: '',
    toolCallId: 'tool',
    responseSchema: { properties: { answer: { type: 'string' } } },
    expiresAt: '2026-09-14T12:00:00Z',
    metadata: { nested: [false, 0, null] },
    subagentRunId: 'child',
  };

  const result = validateInterruptOutcome({
    type: 'interrupt',
    interrupts: [interrupt],
  });
  interrupt.metadata.nested.push(true);
  interrupt.responseSchema.properties.answer.type = 'number';

  expect(result).toEqual([
    {
      ...interrupt,
      metadata: { nested: [false, 0, null] },
      responseSchema: { properties: { answer: { type: 'string' } } },
    },
  ]);
  expect(Object.isFrozen(result)).toBe(true);
  expect(Object.isFrozen(result?.[0])).toBe(true);
  expect(Object.isFrozen(result?.[0].metadata?.['nested'])).toBe(true);
  expect(Object.isFrozen(result?.[0].responseSchema?.['properties'])).toBe(
    true,
  );
  expect(Object.isFrozen(interrupt)).toBe(false);
});

test('treats absent and success outcomes as ordinary completion', () => {
  const outcomes = [undefined, { type: 'success' }];

  const results = outcomes.map(validateInterruptOutcome);

  expect(results).toEqual([undefined, undefined]);
});

test('omits absent optional fields', () => {
  const interrupt = { id: 'a', reason: 'approval', message: undefined };

  const result = validateInterruptOutcome({
    type: 'interrupt',
    interrupts: [interrupt],
  });

  expect(result).toEqual([{ id: 'a', reason: 'approval' }]);
  expect(Object.hasOwn(result?.[0] ?? {}, 'message')).toBe(false);
});

for (const outcome of [
  null,
  {},
  { type: 'unknown' },
  { type: 'interrupt' },
  { type: 'interrupt', interrupts: [] },
  {
    type: 'interrupt',
    interrupts: [
      { id: 'a', reason: 'x' },
      { id: 'a', reason: 'y' },
    ],
  },
]) {
  test(`rejects malformed outcome ${JSON.stringify(outcome)}`, () => {
    const act = () => validateInterruptOutcome(outcome);

    expect(act).toThrow(/interrupt outcome/i);
  });
}

for (const fields of [
  { id: undefined },
  { id: 1 },
  { reason: undefined },
  { reason: null },
  { message: 1 },
  { toolCallId: 2 },
  { subagentRunId: false },
  { responseSchema: [] },
  { metadata: null },
  { expiresAt: 'yesterday' },
  { expiresAt: '2026-02-30T12:00:00Z' },
  { expiresAt: '2026-09-14' },
  { expiresAt: '2026-09-14T25:00:00Z' },
]) {
  test(`rejects malformed interrupt fields ${JSON.stringify(fields)}`, () => {
    const outcome = {
      type: 'interrupt',
      interrupts: [{ id: 'a', reason: 'x', ...fields }],
    };

    const act = () => validateInterruptOutcome(outcome);

    expect(act).toThrow(/interrupt outcome/i);
  });
}

const batch: PendingInterruptBatch = {
  id: 'batch',
  interrupts: [
    { id: 'a', reason: 'x', responseSchema: { type: 'number' } },
    {
      id: 'b',
      reason: 'x',
      expiresAt: '2026-09-14T12:00:00Z',
      responseSchema: { type: 'number' },
    },
  ],
};
const now = Date.parse('2026-09-14T11:59:59Z');

test('owns a complete out-of-order resume without validating its response schema', () => {
  const options: ResumeOptions = {
    batchId: 'batch',
    entries: [
      {
        interruptId: 'b',
        status: 'resolved',
        payload: { values: [null, false, 0] },
        metadata: { nested: ['x'] },
      },
      { interruptId: 'a', status: 'cancelled' },
    ],
  };

  const result = validateResumeOptions(batch, options, now);
  (options.entries[0].payload as { values: unknown[] }).values.push('changed');

  expect(result.entries[0].payload).toEqual({ values: [null, false, 0] });
  expect(result.entries[1]).toEqual({ interruptId: 'a', status: 'cancelled' });
  expect(Object.hasOwn(result.entries[1], 'payload')).toBe(false);
  expect(Object.isFrozen(result)).toBe(true);
  expect(Object.isFrozen(result.entries)).toBe(true);
  expect(Object.isFrozen(result.entries[0])).toBe(true);
  expect(Object.isFrozen(result.entries[0].metadata?.['nested'])).toBe(true);
  expect(
    Object.isFrozen(
      (result.entries[0].payload as { values: unknown[] }).values,
    ),
  ).toBe(true);
  expect(Object.isFrozen(options.entries[0])).toBe(false);
});

for (const payload of [null, false, 0]) {
  test(`preserves resolved payload ${payload}`, () => {
    const options = {
      batchId: 'batch',
      entries: [
        { interruptId: 'a', status: 'resolved', payload },
        { interruptId: 'b', status: 'cancelled' },
      ],
    };

    const result = validateResumeOptions(batch, options, now);

    expect(result.entries[0].payload).toBe(payload);
    expect(Object.hasOwn(result.entries[0], 'payload')).toBe(true);
  });
}

for (const entries of [
  [],
  [{ interruptId: 'a', status: 'resolved' }],
  [
    { interruptId: 'a', status: 'resolved' },
    { interruptId: 'a', status: 'resolved' },
  ],
  [
    { interruptId: 'c', status: 'resolved' },
    { interruptId: 'b', status: 'resolved' },
  ],
  [
    { interruptId: 'a', status: 'unknown' },
    { interruptId: 'b', status: 'resolved' },
  ],
]) {
  test(`rejects invalid resume membership or statuses ${JSON.stringify(entries)}`, () => {
    const options = { batchId: 'batch', entries };

    const act = () => validateResumeOptions(batch, options, now);

    expect(act).toThrow(/invalid resume/i);
  });
}

test('distinguishes stale batch ownership', () => {
  const options = { batchId: 'old', entries: [] };

  const act = () => validateResumeOptions(batch, options, now);

  expect(act).toThrow(/stale.*batch/i);
});

for (const payload of [null, false, 0, '', {}, []]) {
  test(`rejects meaningful cancelled payload ${JSON.stringify(payload)}`, () => {
    const options = {
      batchId: 'batch',
      entries: [
        { interruptId: 'a', status: 'cancelled', payload },
        { interruptId: 'b', status: 'resolved' },
      ],
    };

    const act = () => validateResumeOptions(batch, options, now);

    expect(act).toThrow(/invalid resume/i);
  });
}

for (const time of [
  Date.parse('2026-09-14T12:00:00Z'),
  Date.parse('2026-09-14T12:00:01Z'),
]) {
  test(`blocks the entire batch at and beyond expiry ${time}`, () => {
    const options = {
      batchId: 'batch',
      entries: [
        { interruptId: 'a', status: 'resolved' },
        { interruptId: 'b', status: 'cancelled' },
      ],
    };

    const act = () => validateResumeOptions(batch, options, time);
    const recheck = () => assertInterruptsNotExpired(batch.interrupts, time);

    expect(act).toThrow(/expired.*new thread/i);
    expect(recheck).toThrow(/expired.*new thread/i);
  });
}

for (const value of [
  NaN,
  Infinity,
  BigInt(1),
  () => 1,
  new Date(),
  { nested: undefined },
  [undefined],
]) {
  test(`rejects non-JSON outgoing payload ${String(value)}`, () => {
    const options = {
      batchId: 'batch',
      entries: [
        { interruptId: 'a', status: 'resolved', payload: value },
        { interruptId: 'b', status: 'cancelled' },
      ],
    };

    const act = () => validateResumeOptions(batch, options, now);

    expect(act).toThrow(/invalid resume/i);
  });
}

test('rejects invalid outgoing metadata without exposing its data', () => {
  const options = {
    batchId: 'batch',
    entries: [
      { interruptId: 'a', status: 'resolved', metadata: { secret: undefined } },
      { interruptId: 'b', status: 'cancelled' },
    ],
  };

  const act = () => validateResumeOptions(batch, options, now);

  expect(act).toThrow('Invalid resume responses.');
});

test('accepts string identifiers and extension reasons consistently with the protocol', () => {
  const outcome = { type: 'interrupt', interrupts: [{ id: '', reason: '' }] };

  const result = validateInterruptOutcome(outcome);

  expect(result).toEqual(outcome.interrupts);
});

test('rejects sparse interrupt batches', () => {
  const outcome = { type: 'interrupt', interrupts: new Array(1) };

  const act = () => validateInterruptOutcome(outcome);

  expect(act).toThrow(/interrupt outcome/i);
});

test('accepts valid leap days including years below one hundred', () => {
  const outcome = {
    type: 'interrupt',
    interrupts: [{ id: 'a', reason: 'x', expiresAt: '0000-02-29T12:00:00Z' }],
  };

  const result = validateInterruptOutcome(outcome);

  expect(result).toEqual(outcome.interrupts);
});
