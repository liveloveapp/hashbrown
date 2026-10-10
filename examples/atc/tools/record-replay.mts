import * as sharedModule from '@atc/shared';
import type { AircraftSnapshot } from '@atc/shared';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

// tsx loads the shared sources as CommonJS, so the named exports sit on `default`.
const { AREAS, applySnapshot, findAircraft, INITIAL_STATE, normalizeAdsbLol, parseReplayFile } = (
  sharedModule as unknown as { default?: typeof sharedModule }
).default ?? sharedModule;

const FRAMES = 120;
const INTERVAL_MS = 5000;
const output = resolve(import.meta.dirname, '../shared/public/replay/ord.json');
const { lat, lon, radiusNm } = AREAS.ord;

function round(snapshot: AircraftSnapshot): AircraftSnapshot {
  return {
    at: snapshot.at,
    aircraft: snapshot.aircraft.map((a) => ({
      ...a,
      lat: Math.round(a.lat * 1e4) / 1e4,
      lon: Math.round(a.lon * 1e4) / 1e4,
      groundSpeedKt: a.groundSpeedKt === null ? null : Math.round(a.groundSpeedKt),
      trackDeg: a.trackDeg === null ? null : Math.round(a.trackDeg),
    })),
  };
}

/** Fetches one frame, backing off and retrying when adsb.lol answers 429. */
async function fetchFrame(index: number): Promise<Response> {
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(`https://api.adsb.lol/v2/point/${lat}/${lon}/${radiusNm}`, {
      headers: { 'user-agent': 'hashbrown-atc-example (https://hashbrown.dev)', accept: 'application/json' },
    });
    if (response.ok) return response;
    if (response.status !== 429 || attempt >= 6) {
      throw new Error(`adsb.lol answered ${response.status} on frame ${index + 1}`);
    }
    await sleep(15000);
  }
}

const frames: AircraftSnapshot[] = [];
for (let index = 0; index < FRAMES; index += 1) {
  const response = await fetchFrame(index);
  frames.push(round(normalizeAdsbLol(await response.json(), Date.now())));
  console.log(`frame ${index + 1}/${FRAMES}: ${frames[frames.length - 1].aircraft.length} aircraft`);
  await sleep(INTERVAL_MS);
}

const replay = parseReplayFile({ area: 'ord', recordedAt: frames[0].at, frames });
const first = applySnapshot(INITIAL_STATE, replay.frames[0]);
const arrivals = findAircraft(first, {
  airline: null,
  typeCode: null,
  minAltitudeFt: null,
  maxAltitudeFt: null,
  approaching: 'ORD',
  sortBy: 'distance',
  limit: 20,
});
if (arrivals.length < 3) {
  throw new Error(`Only ${arrivals.length} aircraft approaching ORD in frame 0; record again at a busier time.`);
}
writeFileSync(output, JSON.stringify(replay));
console.log(`wrote ${output} (frame 0: ${frames[0].aircraft.length} aircraft, ${arrivals.length} approaching ORD)`);
