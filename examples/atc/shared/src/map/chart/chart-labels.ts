import type { PixelRect as TagRect } from '../pixels';
import { type LabelRequest, placeLabels } from './label-placer';

/** A chart layer whose labels are placed together with the others'. */
export interface LabelSource {
  /** The layer's labels for the current view, with their candidates. */
  labelRequests(): LabelRequest[];
  /**
   * Shows each label at its chosen candidate and hides the ones that got
   * null or no entry. It applies to the requests from the last
   * `labelRequests()` call.
   */
  applyLabels(placed: ReadonlyMap<string, number | null>): void;
}

/**
 * Places every chart label at once, so airport labels, airspace labels and
 * airports never overlap: gathers each source's requests, keeps them off
 * every drawn airport's box at every zoom (`runwayBoxes`, in container
 * pixels: runway extents, rings, at least 12x12 each), runs `placeLabels`
 * and hands the result back to every source.
 * Call it after the layers redraw (zoom, move, or a sync that changed them),
 * never on aircraft snapshots.
 */
export function placeChartLabels(options: {
  sources: readonly LabelSource[];
  runwayBoxes: () => readonly TagRect[];
}): void {
  const { sources, runwayBoxes } = options;
  const requests = sources.flatMap((source) => source.labelRequests());
  const placed = placeLabels(requests, runwayBoxes());
  for (const source of sources) source.applyLabels(placed);
}
