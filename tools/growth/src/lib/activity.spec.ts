import { expect, test } from 'vitest';

import {
  type ActivityEnvelope,
  asDate,
  canonicalJson,
  insertActivityOnce,
} from './activity.ts';
import { executorWith } from './testing/fake-executor.ts';

const occurredAt = new Date('2026-09-01T12:00:00.000Z');
const envelope: ActivityEnvelope = {
  eventKey: 'test:event:1',
  contactId: '00000000-0000-4000-8000-000000000001',
  occurredAt,
  kind: 'contact.note',
  data: { b: 2, a: { d: [1, { z: 1, y: 2 }], c: 3 } },
};

test('insertActivityOnce inserts, and replays an identical event without error', async () => {
  const inserting = executorWith({
    'insert-activity': () => ({ rows: [{ event_key: envelope.eventKey }] }),
  });
  const replaying = executorWith({
    'insert-activity': () => ({ rows: [] }),
    'read-event-key': () => ({
      rows: [
        {
          contact_id: envelope.contactId,
          project_id: null,
          kind: envelope.kind,
          occurred_at: occurredAt,
          data: { a: { c: 3, d: [1, { y: 2, z: 1 }] }, b: 2 },
        },
      ],
    }),
  });

  const inserted = await insertActivityOnce(inserting.executor, envelope);
  const replayed = await insertActivityOnce(replaying.executor, envelope);

  expect(inserted).toBe('inserted');
  expect(replayed).toBe('replayed');
  expect(inserting.calls[0]?.sql).toMatch(/on conflict \(event_key\)/u);
  expect(inserting.calls[0]?.params).toEqual([
    envelope.eventKey,
    envelope.contactId,
    occurredAt,
    envelope.kind,
    JSON.stringify(envelope.data),
    null,
  ]);
});

test('insertActivityOnce throws on a conflicting replay', async () => {
  const row = {
    contact_id: envelope.contactId,
    project_id: null,
    kind: envelope.kind,
    occurred_at: occurredAt,
    data: envelope.data,
  };
  const conflict = (stored: Record<string, unknown>) =>
    executorWith({
      'insert-activity': () => ({ rows: [] }),
      'read-event-key': () => ({ rows: [{ ...row, ...stored }] }),
    }).executor;

  const results = await Promise.allSettled([
    insertActivityOnce(conflict({ data: { a: 1 } }), envelope),
    insertActivityOnce(conflict({ kind: 'other' }), envelope),
    insertActivityOnce(
      conflict({ occurred_at: new Date('2026-09-02T00:00:00.000Z') }),
      envelope,
    ),
    insertActivityOnce(conflict({ contact_id: 'someone-else' }), envelope),
    insertActivityOnce(conflict({ project_id: 'project-1' }), envelope),
    insertActivityOnce(
      executorWith({
        'insert-activity': () => ({ rows: [] }),
        'read-event-key': () => ({ rows: [] }),
      }).executor,
      envelope,
    ),
  ]);

  for (const result of results) {
    expect(result.status).toBe('rejected');
    expect(String((result as PromiseRejectedResult).reason)).toContain(
      'Growth activity event key conflict: test:event:1',
    );
  }
});

test('canonicalJson sorts keys at every depth and asDate passes null through', () => {
  const left = canonicalJson({ b: [{ y: 1, x: 2 }], a: null });
  const right = canonicalJson({ a: null, b: [{ x: 2, y: 1 }] });

  expect(left).toBe(right);
  expect(asDate(null)).toBeNull();
  expect(asDate('2026-09-01T12:00:00.000Z')).toEqual(occurredAt);
});
