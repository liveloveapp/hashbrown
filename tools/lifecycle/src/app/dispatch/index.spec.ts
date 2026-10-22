import type { RuntimeContext } from '@b4run/sdk';
import { afterEach, expect, test, vi } from 'vitest';

const dispatchLifecycleJobs = vi.hoisted(() => vi.fn());
const createLifecycleDispatcherDependencies = vi.hoisted(() =>
  vi.fn(() => ({ marker: 'tick-dependencies' })),
);

vi.mock('../../dispatcher.ts', () => ({
  dispatchLifecycleJobs,
  createLifecycleDispatcherDependencies,
}));

import { workflow } from './index.ts';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

const RESULT = {
  leased: 2,
  dispatched: 2,
  recoveryPaused: false,
  operatorAlerts: [],
};

function context(): RuntimeContext {
  return { signal: new AbortController().signal } as RuntimeContext;
}

test('workflow returns {...current, result} and rejects a non-integer LIFECYCLE_BATCH_SIZE', async () => {
  vi.stubEnv('LIFECYCLE_BATCH_SIZE', '');
  vi.stubEnv('CAMPAIGN_ENABLED', 'true');
  vi.stubEnv('CAMPAIGN_ENROLLMENT_ENABLED', 'true');
  vi.stubEnv('CAMPAIGN_ENROLLMENT_START_AT', '2026-09-01T00:00:00.000Z');
  vi.stubEnv('GROWTH_INSTALL_DIGEST_ENABLED', 'true');
  dispatchLifecycleJobs.mockResolvedValue(RESULT);
  const runtime = context();

  const state = await workflow(
    {
      trigger: 'nudge',
      submission_id: '00000000-0000-4000-8000-000000000012',
    },
    runtime,
  );
  vi.stubEnv('LIFECYCLE_BATCH_SIZE', '5');
  await workflow({ trigger: 'cron' }, runtime);
  const batchSizes = dispatchLifecycleJobs.mock.calls.map(
    ([request]) => request.batchSize,
  );
  const rejections: PromiseSettledResult<unknown>[] = [];
  for (const value of ['1.5', 'ten', '1e1']) {
    vi.stubEnv('LIFECYCLE_BATCH_SIZE', value);
    rejections.push(
      ...(await Promise.allSettled([workflow({ trigger: 'cron' }, runtime)])),
    );
  }

  expect(state).toEqual({
    trigger: 'nudge',
    submission_id: '00000000-0000-4000-8000-000000000012',
    result: RESULT,
  });
  expect(dispatchLifecycleJobs).toHaveBeenCalledWith(
    {
      batchSize: 20,
      campaignEnabled: true,
      campaignEnrollmentEnabled: true,
      installRuntimeHelloEnabled: false,
      installDigestEnabled: true,
      observationProcessingEnabled: false,
      campaignEnrollmentStartAt: new Date('2026-09-01T00:00:00.000Z'),
      signal: runtime.signal,
    },
    { marker: 'tick-dependencies' },
  );
  expect(createLifecycleDispatcherDependencies).toHaveBeenCalledTimes(2);
  expect(batchSizes).toEqual([20, 5]);
  expect(rejections.map(({ status }) => status)).toEqual([
    'rejected',
    'rejected',
    'rejected',
  ]);
  expect(dispatchLifecycleJobs).toHaveBeenCalledTimes(2);
});

test('workflow refuses an invalid switch before touching the database', async () => {
  vi.stubEnv('DELIVERY_ENABLED', 'yes');

  const run = workflow({ trigger: 'cron' }, context());

  await expect(run).rejects.toThrow(
    'DELIVERY_ENABLED must be exactly true or false',
  );
  expect(createLifecycleDispatcherDependencies).not.toHaveBeenCalled();
  expect(dispatchLifecycleJobs).not.toHaveBeenCalled();
});
