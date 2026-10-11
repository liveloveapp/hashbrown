import type { AtcStore } from '../store';
import { parseChartAirports, parseSurfaces } from './parse';

/** Delays before the first and second retry of the airports fetch. */
export const CHART_RETRY_MS = [30_000, 120_000];

/** Delay between every retry after those in {@link CHART_RETRY_MS}. */
export const CHART_RETRY_EVERY_MS = 600_000;

/** Schedules `fn` after `ms`; returns a function that cancels it. */
type Schedule = (fn: () => void, ms: number) => () => void;

const defaultSchedule: Schedule = (fn, ms) => {
  const timer = setTimeout(fn, ms);
  return () => clearTimeout(timer);
};

/**
 * Loads `/api/chart/airports` into the store. On failure the chart becomes
 * `limited` (only while still `loading`) and the fetch is retried after 30 s,
 * 2 min, then every 10 min until one succeeds. Returns a function that stops it.
 */
export function startChartFeed(options: {
  store: AtcStore;
  fetchFn?: typeof fetch;
  schedule?: Schedule;
}): () => void {
  const { store, fetchFn = fetch, schedule = defaultSchedule } = options;
  let stopped = false;
  let cancel: (() => void) | undefined;
  let attempt = 0;

  const run = async () => {
    try {
      const response = await fetchFn('/api/chart/airports');
      if (!response.ok) {
        throw new Error(`Chart feed returned ${response.status}`);
      }
      const parsed = parseChartAirports(await response.json());
      if (!stopped) {
        store.setChart(parsed);
      }
    } catch {
      if (stopped) {
        return;
      }
      if (store.getState().chart.status === 'loading') {
        store.setChartLimited();
      }
      const delay = CHART_RETRY_MS[attempt] ?? CHART_RETRY_EVERY_MS;
      attempt += 1;
      cancel = schedule(() => void run(), delay);
    }
  };
  void run();

  return () => {
    stopped = true;
    cancel?.();
  };
}

/**
 * Loads one airport's surfaces into the store, once per code. Sets `loading`
 * first, then the parsed result, or `failed` on any error.
 */
export async function loadSurfaces(options: {
  store: AtcStore;
  code: string;
  fetchFn?: typeof fetch;
}): Promise<void> {
  const { store, code, fetchFn = fetch } = options;
  if (store.getState().surfaces.has(code)) {
    return;
  }
  store.setSurfaces(code, 'loading');
  try {
    const response = await fetchFn(
      `/api/chart/surfaces?airport=${encodeURIComponent(code)}`,
    );
    if (!response.ok) {
      throw new Error(`Surfaces returned ${response.status}`);
    }
    store.setSurfaces(code, parseSurfaces(await response.json(), code));
  } catch {
    store.setSurfaces(code, 'failed');
  }
}
