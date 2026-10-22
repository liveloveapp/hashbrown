import type { RuntimeContext } from '@b4run/sdk';

import type { DispatchState } from './state.ts';

/**
 * The dispatch workflow. Stub until the dispatcher lands; reports an idle
 * tick.
 */
export async function workflow(
  current: DispatchState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- used once the dispatcher is wired
  _context: RuntimeContext,
): Promise<DispatchState> {
  return {
    ...current,
    result: {
      leased: 0,
      dispatched: 0,
      recoveryPaused: false,
      operatorAlerts: [],
    },
  };
}
