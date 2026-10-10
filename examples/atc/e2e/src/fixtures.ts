import {
  type AircraftRow,
  type AircraftSnapshot,
  applySnapshot,
  findAircraft,
  type FindAircraftInput,
  INITIAL_STATE,
  parseReplayFile,
} from '@atc/shared';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const replay = parseReplayFile(
  JSON.parse(
    readFileSync(
      resolve(__dirname, '../../shared/public/replay/ord.json'),
      'utf8',
    ),
  ),
);

/** Every hex in the recording; a rendered card must use one of these. */
export const RECORDED_HEXES = new Set(
  replay.frames.flatMap((frame) => frame.aircraft.map((a) => a.hex)),
);

const ANY: FindAircraftInput = {
  airline: null,
  typeCode: null,
  minAltitudeFt: null,
  maxAltitudeFt: null,
  approaching: null,
  sortBy: 'altitude',
  limit: 20,
};

function presentThroughout(
  hex: string,
  frames: readonly AircraftSnapshot[],
): boolean {
  return frames.every((frame) => frame.aircraft.some((a) => a.hex === hex));
}

const window = replay.frames.slice(0, 40);
const state = applySnapshot(INITIAL_STATE, replay.frames[0]);
const persistent = (rows: AircraftRow[]) =>
  rows.filter((row) => presentThroughout(row.hex, window));

/** The scenario aircraft, chosen from frame 0 and present for the first 40 frames. */
export const scenario = (() => {
  const nearby = persistent(
    findAircraft(state, { ...ANY, sortBy: 'distance' }),
  );
  const selected = nearby.find((row) =>
    window
      .slice(0, 20)
      .some(
        (frame) =>
          frame.aircraft.find((a) => a.hex === row.hex)?.altitudeFt !==
          row.altitudeFt,
      ),
  );
  const highest = persistent(findAircraft(state, ANY))[0];
  const fastest = persistent(
    findAircraft(state, { ...ANY, sortBy: 'speed' }),
  ).find((row) => row.hex !== highest?.hex);
  const arrivals = persistent(
    findAircraft(state, {
      ...ANY,
      approaching: 'ORD',
      sortBy: 'distance',
      limit: 10,
    }),
  );
  if (!selected || !highest || !fastest || arrivals.length === 0) {
    throw new Error(
      'The replay lacks a scenario aircraft; record it again (npx nx record-replay atc).',
    );
  }

  return { selected, highest, fastest, arrivals };
})();

/** The JSON a UI chat answer contains. */
export function ui(
  ...components: Record<string, { props: Record<string, unknown> }>[]
): string {
  return JSON.stringify({ ui: components });
}
