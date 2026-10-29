import type { RuntimeContext } from '@b4run/sdk';
import { expect, test } from 'vitest';

import { workflow } from './index.ts';

test('workflow returns {...current, result} with nothing leased, published, failed or held', async () => {
  const context = {
    signal: new AbortController().signal,
  } as RuntimeContext;

  const state = await workflow({ trigger: 'cron' }, context);

  expect(state).toEqual({
    trigger: 'cron',
    result: { leased: 0, published: 0, failed: 0, held: 0, operatorAlerts: [] },
  });
});
