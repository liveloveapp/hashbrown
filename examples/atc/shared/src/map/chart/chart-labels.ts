import type { TagRect } from '../tag-obstacles';
import { type LabelRequest, placeLabels } from './label-placer';

/** From this zoom every drawn airport's runways keep labels off them. */
export const OBSTACLE_ZOOM = 10;

/** A chart layer whose labels are placed together with the others'. */
export interface LabelSource {
  /** The layer's labels for the current view, with their candidates. */
  labelRequests(): LabelRequest[];
  /**
   * Shows each label at its chosen candidate and hides the ones that got
   * null or no entry.
   */
  applyLabels(placed: ReadonlyMap<string, number | null>): void;
}

/**
 * Places every chart label at once, so airport labels, airspace labels and
 * runways never overlap: gathers each source's requests, keeps them off the
 * drawn runways from {@link OBSTACLE_ZOOM} (`runwayBoxes`, in container
 * pixels), runs `placeLabels` and hands the result back to every source.
 * Call it after the layers redraw (zoom, move, or a sync that changed them),
 * never on aircraft snapshots.
 */
export function placeChartLabels(options: {
  zoom: number;
  sources: readonly LabelSource[];
  runwayBoxes: () => readonly TagRect[];
}): void {
  const { zoom, sources, runwayBoxes } = options;
  const requests = sources.flatMap((source) => source.labelRequests());
  const obstacles = zoom >= OBSTACLE_ZOOM ? runwayBoxes() : [];
  const placed = placeLabels(requests, obstacles);
  for (const source of sources) source.applyLabels(placed);
}
