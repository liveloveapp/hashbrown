import { expect, test, vi } from 'vitest';

import { runInboxOperations } from './inbox-operations.mts';

function setup() {
  return {
    status: vi.fn(async () => ({ healthy: false, codes: ['coverage_stale'] })),
    recover: vi.fn(async () => ({
      complete: false,
      received: 0,
      processed: 0,
    })),
    review: vi.fn(async () => undefined),
    writeOutput: vi.fn(),
    writeError: vi.fn(),
  };
}

test('health exits nonzero for incomplete coverage and emits safe diagnostic codes', async () => {
  const deps = setup();

  const code = await runInboxOperations(['health'], deps);

  expect(code).toBe(1);
  expect(deps.writeOutput).toHaveBeenCalledWith(
    JSON.stringify({ healthy: false, codes: ['coverage_stale'] }),
  );
});

test('receipt review requires exactly one receipt and bounded audit references', async () => {
  const deps = setup();

  const code = await runInboxOperations(
    [
      'review-ignore',
      '--receipt-id',
      'receipt-1',
      '--actor',
      'founder',
      '--evidence',
      'review-1',
    ],
    deps,
  );
  const invalid = await runInboxOperations(
    ['review-ignore', '--receipt-id', 'receipt-1'],
    deps,
  );

  expect(code).toBe(0);
  expect(invalid).toBe(2);
  expect(deps.review).toHaveBeenCalledTimes(1);
  expect(deps.review).toHaveBeenCalledWith({
    receiptId: 'receipt-1',
    actor: 'founder',
    evidence: 'review-1',
  });
});

test('provider and database failures never print private errors', async () => {
  const deps = setup();
  deps.recover.mockRejectedValue(
    new Error('postgres://secret private@example.com'),
  );

  const code = await runInboxOperations(['recover'], deps);

  expect(code).toBe(1);
  expect(deps.writeError).toHaveBeenCalledWith(
    'Inbox operation failed; campaigns remain blocked.',
  );
});

test('duplicate receipt options are rejected before any operator review', async () => {
  const deps = setup();

  const code = await runInboxOperations(
    [
      'review-ignore',
      '--receipt-id',
      'receipt-1',
      '--receipt-id',
      'receipt-2',
      '--actor',
      'founder',
      '--evidence',
      'review-1',
    ],
    deps,
  );

  expect(code).toBe(2);
  expect(deps.review).not.toHaveBeenCalled();
});
