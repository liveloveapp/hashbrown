import { expect, test } from 'vitest';

import { executorWith } from '../testing/fake-executor.ts';
import {
  readObservationHealth,
  readObservationIdentity,
  readTimeline,
} from './queries.ts';
import { readGrowthFunnel } from './journey-report.ts';

const subjectId = '44444444-4444-4444-8444-444444444444';
const observationId = '55555555-5555-4555-8555-555555555555';
const lastId = '66666666-6666-4666-8666-666666666666';
const emptyRows = () => ({ rows: [] });

function timelineRow(id: string, receivedAt: string): Record<string, unknown> {
  return { id, received_at: new Date(receivedAt) };
}

test('readTimeline paginates by (received_at, id) and rejects a cursor over 300 chars', async () => {
  const { executor, calls } = executorWith({
    'observation-read-timeline': () => ({
      rows: [
        timelineRow(observationId, '2026-10-20T00:00:00.000Z'),
        timelineRow(lastId, '2026-10-20T01:00:00.000Z'),
        timelineRow(subjectId, '2026-10-20T02:00:00.000Z'),
      ],
    }),
  });

  const first = await readTimeline(executor, subjectId, { limit: 2 });
  await readTimeline(executor, subjectId, {
    limit: 2,
    cursor: first.nextCursor ?? undefined,
  });
  const tooLong = readTimeline(executor, subjectId, {
    cursor: 'a'.repeat(301),
  });

  expect(first.events.map((e) => e.id)).toEqual([observationId, lastId]);
  expect(first.nextCursor).not.toBeNull();
  expect(
    JSON.parse(
      Buffer.from(first.nextCursor ?? '', 'base64url').toString('utf8'),
    ),
  ).toEqual(['2026-10-20T01:00:00.000Z', lastId]);
  expect(calls.map((c) => c.marker)).toEqual([
    'observation-read-timeline',
    'observation-read-timeline',
  ]);
  expect(calls[0].params).toEqual([subjectId, null, null, 3]);
  expect(calls[1].params).toEqual([
    subjectId,
    new Date('2026-10-20T01:00:00.000Z'),
    lastId,
    3,
  ]);
  expect(calls[1].sql).toContain('(o.received_at,o.id)>($2,$3::uuid)');
  expect(calls[1].sql).toContain('order by o.received_at,o.id');
  await expect(tooLong).rejects.toMatchObject({ code: 'invalid_cursor' });
});

test('readTimeline rejects a limit over 100 before querying', async () => {
  const { executor, calls } = executorWith({});

  const result = readTimeline(executor, subjectId, { limit: 101 });

  await expect(result).rejects.toMatchObject({ code: 'invalid_payload' });
  expect(calls).toEqual([]);
});

test('readObservationIdentity reads only the identity row, with no form-link fallback', async () => {
  const { executor, calls } = executorWith({
    'observation-read-identity': emptyRows,
  });

  const identity = await readObservationIdentity(executor, observationId);

  expect(identity).toBeNull();
  expect(calls.map((c) => c.marker)).toEqual(['observation-read-identity']);
  expect(calls[0].params).toEqual([observationId]);
});

test('readObservationHealth and readGrowthFunnel reject ranges over 31 days', async () => {
  const { executor, calls } = executorWith({});
  const from = new Date('2026-09-01T00:00:00.000Z');
  const tooFar = new Date('2026-10-02T00:00:01.000Z');

  const health = readObservationHealth(executor, { from, to: tooFar });
  const funnel = readGrowthFunnel(executor, { from, to: tooFar });
  const backwards = readGrowthFunnel(executor, { from, to: from });

  await expect(health).rejects.toMatchObject({ code: 'invalid_payload' });
  await expect(funnel).rejects.toMatchObject({ code: 'invalid_payload' });
  await expect(backwards).rejects.toMatchObject({ code: 'invalid_payload' });
  expect(calls).toEqual([]);
});

test('readObservationHealth reports activity, the work queue, and service-log ingress failures', async () => {
  const from = new Date('2026-10-01T00:00:00.000Z');
  const to = new Date('2026-10-02T00:00:00.000Z');
  const { executor, calls } = executorWith({
    'observation-read-health-activity': () => ({
      rows: [{ source: 'install', observation_count: '1' }],
    }),
    'observation-read-work-health': () => ({ rows: [{ status: 'pending' }] }),
  });

  const health = await readObservationHealth(executor, { from, to });

  expect(health).toEqual({
    from: from.toISOString(),
    to: to.toISOString(),
    activity: [{ source: 'install', observation_count: '1' }],
    currentQueue: [{ status: 'pending' }],
    ingressFailures: 'service_logs',
  });
  expect(calls.map((c) => c.marker)).toEqual([
    'observation-read-health-activity',
    'observation-read-work-health',
  ]);
  expect(calls[0].params).toEqual([from, to]);
});
