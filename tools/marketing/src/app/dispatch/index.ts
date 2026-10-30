import type { RuntimeContext } from '@b4run/sdk';

import {
  createDispatchDependencies,
  dispatchMarketing,
} from '../../dispatcher.ts';
import type { DispatchState } from './state.ts';

/**
 * The dispatch workflow: one marketing tick per run, triggered by the cron.
 * It leases the due approved posts, publishes them and returns the current
 * state with the tick's result.
 *
 * @throws When a required environment variable is missing or invalid, or the
 *   lease fails.
 */
export async function workflow(
  current: DispatchState,
  context: RuntimeContext,
): Promise<DispatchState> {
  const result = await dispatchMarketing(
    createDispatchDependencies(process.env),
    context.signal,
  );
  return { ...current, result };
}
