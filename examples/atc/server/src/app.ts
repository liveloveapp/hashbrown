import express, { type Express } from 'express';
import { join } from 'node:path';
import { createAircraftHandler } from './aircraft-handler';
import { createChartAirportsHandler } from './chart-airports-handler';
import { createChartAirspaceHandler } from './chart-airspace-handler';
import { createChartSurfacesHandler } from './chart-surfaces-handler';
import { createDecideHandler } from './decide-handler';
import { createFilterHandler } from './filter-handler';
import type { NodeHandler } from './http';
import { createRunHandler, type RunHandlerOptions } from './run-handler';

/**
 * The atc server for local development and e2e: the API routes, plus
 * optional static app folders served like production (`/angular`, `/react`).
 */
export function createApp(options: {
  run: RunHandlerOptions;
  statics?: readonly { path: string; dir: string }[];
}): Express {
  const app = express();
  const routes: [string, NodeHandler][] = [
    ['/api/run', createRunHandler(options.run)],
    ['/api/filter', createFilterHandler(options.run)],
    ['/api/decide', createDecideHandler(process.env)],
    ['/api/aircraft', createAircraftHandler()],
    ['/api/chart/airports', createChartAirportsHandler()],
    ['/api/chart/surfaces', createChartSurfacesHandler()],
    ['/api/chart/airspace', createChartAirspaceHandler()],
  ];
  for (const [path, handler] of routes) {
    // A handler that fails after streaming began cannot send a 500; drop the
    // connection instead.
    app.all(
      path,
      (req, res) => void handler(req, res).catch(() => res.destroy()),
    );
  }
  for (const { path, dir } of options.statics ?? []) {
    app.use(path, express.static(dir));
    app.get(`${path}/*`, (_req, res) => res.sendFile(join(dir, 'index.html')));
  }

  return app;
}
