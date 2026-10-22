import { expect, test, vi } from 'vitest';

import type { SqlExecutor } from '../database.ts';
import { executorWith } from '../testing/fake-executor.ts';
import { consumeSourceBudget, consumeSubjectBudgets } from './admission.ts';
import type { CollectionEventV1 } from './contracts.ts';

const subjectA = '22222222-2222-4222-8222-222222222222';
const subjectB = '33333333-3333-4333-8333-333333333333';

function event(id: string): CollectionEventV1 {
  return {
    subject: { id, namespace: 'installation', scope: 'persistent' },
  } as CollectionEventV1;
}

test('consumeSourceBudget allows up to 1200 per minute and reports retryAfterSec', async () => {
  const now = new Date('2026-09-04T12:00:15.000Z');
  const { executor, calls } = executorWith({
    'collection-budget': () => ({ rows: [{ count: '1200' }] }),
  });

  const result = await consumeSourceBudget(executor, 'install', now);

  expect(result).toEqual({ allowed: true, retryAfterSec: 45 });
  expect(calls[0].params).toEqual([
    'source:install',
    new Date('2026-09-04T12:00:00.000Z'),
    1,
  ]);
});

test('consumeSubjectBudgets charges every bucket even when denying and returns the next-minute retryAfterSec', async () => {
  const now = new Date('2026-09-04T12:00:59.000Z');
  const { executor, calls } = executorWith({
    'collection-budget': (params) => ({
      rows: [
        {
          count: params[0] === `subject:installation:${subjectA}` ? '121' : '1',
        },
      ],
    }),
  });

  const result = await consumeSubjectBudgets(
    executor,
    'install',
    [event(subjectB), event(subjectA), event(subjectA)],
    now,
  );

  expect(result).toEqual({ allowed: false, retryAfterSec: 1 });
  expect(calls.map((c) => c.params[0])).toEqual([
    `subject:installation:${subjectA}`,
    `subject:installation:${subjectB}`,
  ]);
  expect(calls.map((c) => c.params[2])).toEqual([2, 1]);
});

test('admission fails closed on a storage error', async () => {
  const db = {
    transaction: async () => {
      throw new Error('secret');
    },
  } as unknown as SqlExecutor;

  const outcome = consumeSourceBudget(db, 'install', new Date());

  await expect(outcome).rejects.toThrow('admission_unavailable');
});

test('subject budgets reject empty, oversized, or mismatched batches before storage', async () => {
  const db = { transaction: vi.fn() } as unknown as SqlExecutor;
  const now = new Date();

  const empty = consumeSubjectBudgets(db, 'install', [], now);
  const big = consumeSubjectBudgets(
    db,
    'install',
    Array(21).fill(event(subjectA)),
    now,
  );
  const wrong = consumeSubjectBudgets(db, 'runtime', [event(subjectA)], now);

  await expect(empty).rejects.toThrow('invalid_payload');
  await expect(big).rejects.toThrow('invalid_payload');
  await expect(wrong).rejects.toThrow('invalid_payload');
  expect(db.transaction).not.toHaveBeenCalled();
});
