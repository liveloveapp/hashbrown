import type { RuntimeContext } from '@b4run/sdk';
import { expect, test, vi } from 'vitest';

const dispatcher = vi.hoisted(() => ({
  createDispatchDependencies: vi.fn(() => ({ marker: 'deps' })),
  dispatchMarketing: vi.fn(async () => ({
    leased: 2,
    published: 1,
    failed: 1,
    held: 0,
    operatorAlerts: ['post_failed' as const],
  })),
}));
vi.mock('../../dispatcher.ts', () => dispatcher);

import { workflow } from './index.ts';

test('workflow runs one tick with the environment and the run signal, and returns {...current, result}', async () => {
  const signal = new AbortController().signal;

  const state = await workflow({ trigger: 'cron' }, {
    signal,
  } as RuntimeContext);

  expect(dispatcher.createDispatchDependencies).toHaveBeenCalledWith(
    process.env,
  );
  expect(dispatcher.dispatchMarketing).toHaveBeenCalledWith(
    { marker: 'deps' },
    signal,
  );
  expect(state).toEqual({
    trigger: 'cron',
    result: {
      leased: 2,
      published: 1,
      failed: 1,
      held: 0,
      operatorAlerts: ['post_failed'],
    },
  });
});
