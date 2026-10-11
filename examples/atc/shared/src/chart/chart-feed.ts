import type { AtcStore } from '../store';
import { parseAirspace, parseChartAirports, parseSurfaces } from './parse';

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
 * Loads `/api/chart/airports` and `/api/chart/airspace` into the store, in
 * parallel. On failure the chart becomes `limited` and airspace `failed` (only
 * while still `loading`), and each fetch is retried on its own chain after
 * 30 s, 2 min, then every 10 min until one succeeds. Returns a function that
 * stops both.
 */
export function startChartFeed(options: {
  store: AtcStore;
  fetchFn?: typeof fetch;
  schedule?: Schedule;
}): () => void {
  const { store, fetchFn = fetch, schedule = defaultSchedule } = options;
  let stopped = false;
  const cancels = new Set<() => void>();

  /** Runs `load` now and again on the retry schedule until it succeeds. */
  const retrying = (load: () => Promise<void>, fail: () => void) => {
    let attempt = 0;
    const run = async () => {
      try {
        await load();
      } catch {
        if (stopped) {
          return;
        }
        fail();
        const delay = CHART_RETRY_MS[attempt] ?? CHART_RETRY_EVERY_MS;
        attempt += 1;
        const cancel = schedule(() => {
          cancels.delete(cancel);
          void run();
        }, delay);
        cancels.add(cancel);
      }
    };
    void run();
  };

  retrying(
    async () => {
      const response = await fetchFn('/api/chart/airports');
      if (!response.ok) {
        throw new Error(`Chart feed returned ${response.status}`);
      }
      const parsed = parseChartAirports(await response.json());
      if (!stopped) {
        store.setChart(parsed);
      }
    },
    () => {
      if (store.getState().chart.status === 'loading') {
        store.setChartLimited();
      }
    },
  );
  retrying(
    async () => {
      const response = await fetchFn('/api/chart/airspace');
      if (!response.ok) {
        throw new Error(`Airspace feed returned ${response.status}`);
      }
      const parsed = parseAirspace(await response.json());
      if (!stopped) {
        store.setAirspace(parsed);
      }
    },
    () => store.setAirspaceFailed(),
  );

  return () => {
    stopped = true;
    for (const cancel of cancels) {
      cancel();
    }
    cancels.clear();
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
