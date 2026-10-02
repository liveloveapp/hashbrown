import { expect, test } from 'vitest';
import type { LedgerSnapshot } from '@invoicing/contracts';
import { takePrefetchedSnapshot } from './snapshot-prefetch';

test('the prefetched snapshot request is handed over once', () => {
  const request = Promise.resolve({} as LedgerSnapshot);
  const host: Pick<Window, '__invoicingSnapshot'> = {
    __invoicingSnapshot: request,
  };

  const first = takePrefetchedSnapshot(host);
  const second = takePrefetchedSnapshot(host);

  expect(first).toBe(request);
  expect(second).toBeUndefined();
});
