import type { WorkbenchEvent } from './workbench';
import type { WorkbenchExchange } from './workbench-requests';

/**
 * The exchange the Requests detail follows at a playhead position: the last
 * exchange that has started by event `at`, preferring one in the playhead's
 * own turn. Between requests, and in a turn that has not sent its request yet,
 * that is the most recent exchange before the playhead.
 *
 * @param exchanges - Every exchange in event order, as from `workbenchExchanges`.
 * @param events - The captured events the exchanges index into.
 * @param at - The playhead's event index.
 * @returns The exchange at the playhead, or `null` before the first one starts.
 */
export function exchangeAtPlayhead(
  exchanges: readonly WorkbenchExchange[],
  events: readonly WorkbenchEvent[],
  at: number,
): WorkbenchExchange | null {
  const started = exchanges.filter((exchange) => exchange.firstIndex <= at);
  const turn = events[at]?.turn;
  return (
    started.filter((exchange) => exchange.turn === turn).at(-1) ??
    started.at(-1) ??
    null
  );
}
