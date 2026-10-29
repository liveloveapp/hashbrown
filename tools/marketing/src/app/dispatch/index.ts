import type { RuntimeContext } from '@b4run/sdk';

import type { DispatchState } from './state.ts';

/**
 * The dispatch workflow: one marketing tick per run, triggered by the cron.
 * It publishes nothing yet; it returns the current state with an empty
 * result.
 */
export async function workflow(
  current: DispatchState,
  context: RuntimeContext,
): Promise<DispatchState> {
  void context;
  return {
    ...current,
    result: { leased: 0, published: 0, failed: 0, held: 0, operatorAlerts: [] },
  };
}
