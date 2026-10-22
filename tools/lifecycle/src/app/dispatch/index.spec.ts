import type { RuntimeContext } from '@b4run/sdk';
import { expect, test, vi } from 'vitest';

const dispatchLifecycleJobs = vi.hoisted(() => vi.fn());
const createLifecycleDispatcherDependencies = vi.hoisted(() =>
  vi.fn(() => ({ marker: 'tick-dependencies' })),
);

vi.mock('../../dispatcher.ts', () => ({
  dispatchLifecycleJobs,
  createLifecycleDispatcherDependencies,
}));

import { workflow } from './index.ts';

// Env stubs and mock calls are reset between tests by `unstubEnvs` and
// `clearMocks` in vitest.config.mts.

const RESULT = {
  leased: 2,
  dispatched: 2,
  recoveryPaused: false,
  operatorAlerts: [],
};

function context(): RuntimeContext {
  return { signal: new AbortController().signal } as RuntimeContext;
}

test('workflow returns {...current, result} with the configured switches and the default batch size', async () => {
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
  expect(createLifecycleDispatcherDependencies).toHaveBeenCalledOnce();
});

test('workflow passes an integer LIFECYCLE_BATCH_SIZE to the dispatcher', async () => {
  vi.stubEnv('LIFECYCLE_BATCH_SIZE', '5');
  dispatchLifecycleJobs.mockResolvedValue(RESULT);

  await workflow({ trigger: 'cron' }, context());

  expect(dispatchLifecycleJobs).toHaveBeenCalledWith(
    expect.objectContaining({ batchSize: 5 }),
    { marker: 'tick-dependencies' },
  );
});

test.each(['1.5', 'ten', '1e1', '-3'])(
  'workflow rejects the non-integer LIFECYCLE_BATCH_SIZE %s',
  async (value) => {
    vi.stubEnv('LIFECYCLE_BATCH_SIZE', value);
    dispatchLifecycleJobs.mockResolvedValue(RESULT);

    const run = workflow({ trigger: 'cron' }, context());

    await expect(run).rejects.toThrow(
      'LIFECYCLE_BATCH_SIZE must be an integer',
    );
    expect(dispatchLifecycleJobs).not.toHaveBeenCalled();
  },
);

test('workflow refuses an invalid switch before touching the database', async () => {
  vi.stubEnv('DELIVERY_ENABLED', 'yes');

  const run = workflow({ trigger: 'cron' }, context());

  await expect(run).rejects.toThrow(
    'DELIVERY_ENABLED must be exactly true or false',
  );
  expect(createLifecycleDispatcherDependencies).not.toHaveBeenCalled();
  expect(dispatchLifecycleJobs).not.toHaveBeenCalled();
});
