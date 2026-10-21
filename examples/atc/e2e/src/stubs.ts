import type { AircraftSnapshot } from '@atc/shared';
import type { BrowserContext, Page } from '@playwright/test';
import {
  CHART_AIRPORTS,
  CHART_AIRSPACE,
  chartSurfaces,
} from './chart-fixtures';

/**
 * Serves atc's data routes from the fixtures: aircraft frames from `frames`,
 * the chart fixtures, and no scheduled routes. The router answers 503, so
 * typed messages go to chat. Map tiles load unless
 * `blockTiles`.
 */
export async function stubAtcFeeds(
  target: Page | BrowserContext,
  options: {
    readonly frames: (n: number) => AircraftSnapshot;
    readonly blockTiles: boolean;
  },
): Promise<void> {
  if (options.blockTiles) {
    await target.route('https://tile.openstreetmap.org/**', (route) =>
      route.abort(),
    );
  }
  await target.route('https://vrs-standing-data.adsb.lol/**', (route) =>
    route.fulfill({ status: 404, body: '' }),
  );
  await target.route('**/api/chart/airports', (route) =>
    route.fulfill({ json: CHART_AIRPORTS }),
  );
  await target.route('**/api/chart/surfaces**', (route) =>
    route.fulfill({
      json: chartSurfaces(
        new URL(route.request().url()).searchParams.get('airport') ?? '',
      ),
    }),
  );
  await target.route('**/api/chart/airspace', (route) =>
    route.fulfill({ json: CHART_AIRSPACE }),
  );
  // The router is unavailable, as it is without a key: every typed message
  // goes to chat. A later task scripts real routes.
  await target.route('**/api/decide**', (route) =>
    route.fulfill({ status: 503, json: { code: 'unavailable' } }),
  );
  let next = 0;
  await target.route('**/api/aircraft**', (route) =>
    route.fulfill({ json: options.frames(next++) }),
  );
}
