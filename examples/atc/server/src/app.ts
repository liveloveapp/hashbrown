import express, { type Express } from 'express';
import { join } from 'node:path';
import { createAircraftHandler } from './aircraft-handler';
import { createChartAirportsHandler } from './chart-airports-handler';
import { createRunHandler, type RunHandlerOptions } from './run-handler';

/**
 * The atc server for local development and e2e: the API routes, plus
 * optional static app folders served like production (`/angular`, `/react`).
 */
export function createApp(options: {
  run: RunHandlerOptions;
  aircraft?: { fetchFn?: typeof fetch; now?: () => number };
  chart?: { fetchFn?: typeof fetch; now?: () => number };
  statics?: readonly { path: string; dir: string }[];
}): Express {
  const app = express();
  const run = createRunHandler(options.run);
  const aircraft = createAircraftHandler(options.aircraft);
  app.all(
    '/api/run',
    (req, res) => void run(req, res).catch(() => res.destroy()),
  );
  app.all(
    '/api/aircraft',
    (req, res) => void aircraft(req, res).catch(() => res.destroy()),
  );
  const chartAirports = createChartAirportsHandler(options.chart);
  app.all(
    '/api/chart/airports',
    (req, res) => void chartAirports(req, res).catch(() => res.destroy()),
  );
  for (const { path, dir } of options.statics ?? []) {
    app.use(path, express.static(dir));
    app.get(`${path}/*`, (_req, res) => res.sendFile(join(dir, 'index.html')));
  }

  return app;
}
