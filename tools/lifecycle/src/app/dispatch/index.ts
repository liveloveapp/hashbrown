import type { RuntimeContext } from '@b4run/sdk';

import { loadLifecycleRuntimeConfiguration } from '../../campaign/send.ts';
import {
  createLifecycleDispatcherDependencies,
  dispatchLifecycleJobs,
} from '../../dispatcher.ts';
import type { DispatchState } from './state.ts';

const DEFAULT_BATCH_SIZE = 20;

function configuredBatchSize(
  environment: Readonly<Record<string, string | undefined>>,
): number {
  const raw = environment['LIFECYCLE_BATCH_SIZE'];
  if (!raw) return DEFAULT_BATCH_SIZE;
  if (!/^\d+$/u.test(raw)) {
    throw new Error('LIFECYCLE_BATCH_SIZE must be an integer');
  }
  return Number(raw);
}

/**
 * The dispatch workflow: one lifecycle tick per run, triggered by the cron or
 * a form nudge. It reads the switches and `LIFECYCLE_BATCH_SIZE` (default 20,
 * an integer 1..25), builds the tick's dependencies once, and returns the
 * current state with the dispatcher's result.
 *
 * @throws When a switch or the batch size is malformed, or the tick fails.
 */
export async function workflow(
  current: DispatchState,
  context: RuntimeContext,
): Promise<DispatchState> {
  const environment = process.env;
  const configuration = loadLifecycleRuntimeConfiguration(environment);
  const batchSize = configuredBatchSize(environment);
  const result = await dispatchLifecycleJobs(
    {
      batchSize,
      campaignEnabled: configuration.campaignEnabled,
      campaignEnrollmentEnabled: configuration.campaignEnrollmentEnabled,
      installRuntimeHelloEnabled: configuration.installRuntimeHelloEnabled,
      installDigestEnabled: configuration.installDigestEnabled,
      observationProcessingEnabled: configuration.observationProcessingEnabled,
      ...(configuration.campaignEnrollmentStartAt
        ? { campaignEnrollmentStartAt: configuration.campaignEnrollmentStartAt }
        : {}),
      signal: context.signal,
    },
    createLifecycleDispatcherDependencies(environment),
  );
  return { ...current, result };
}
