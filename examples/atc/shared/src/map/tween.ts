import { distanceNm } from '../geo';
import type { LatLon } from '../places';

/** Moves longer than this jump instead of easing (data gaps, bad fixes). */
const MAX_TWEEN_NM = 20;
/**
 * How far past a fix a plane is extrapolated, at most, in seconds: past two
 * server refreshes (10 s each) and a poll, so a late adsb.lol answer never
 * freezes every plane at once.
 */
export const MAX_DEAD_RECKON_S = 30;
/** How long a new fix takes to absorb the gap from where the plane is drawn. */
export const CORRECTION_MS = 1000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** True when a marker should ease from `from` to `to`: it moved, by at most 20 nm. */
export function shouldTween(from: LatLon, to: LatLon): boolean {
  const distance = distanceNm(from, to);

  return distance > 0 && distance <= MAX_TWEEN_NM;
}

/**
 * Where a plane at `from` would be after `seconds` along `trackDeg` at
 * `speedKt`, on a flat-earth approximation that is exact enough for the few
 * nautical miles between snapshots.
 */
export function deadReckon(
  from: LatLon,
  trackDeg: number,
  speedKt: number,
  seconds: number,
): LatLon {
  const nm = (speedKt * seconds) / 3600;
  if (nm === 0) {
    return { lat: from.lat, lon: from.lon };
  }
  const track = (trackDeg * Math.PI) / 180;
  const lat = from.lat + (nm * Math.cos(track)) / 60;
  const lon =
    from.lon +
    (nm * Math.sin(track)) / (60 * Math.cos((from.lat * Math.PI) / 180));

  return { lat, lon };
}

/**
 * How one marker moves: dead-reckoned from its latest fix (`base`, first seen
 * at `baseAt`), plus an `offset` from where it was drawn that eases away over
 * {@link CORRECTION_MS} from `offsetAt`. Times are `performance.now()` ms.
 */
export interface Motion {
  readonly base: LatLon;
  readonly baseAt: number;
  /** Null when the plane should not be extrapolated (on the ground, no data). */
  readonly velocity: {
    readonly trackDeg: number;
    readonly speedKt: number;
  } | null;
  readonly offset: LatLon;
  readonly offsetAt: number;
  /** The track to draw the plane at once its turn has eased away, in degrees. */
  readonly headingDeg: number;
  /** Degrees still to turn at `turnAt` (signed, the short way round). */
  readonly turnDeg: number;
  readonly turnAt: number;
}

/** The parts of an aircraft a {@link Motion} reads. */
export interface Fix extends LatLon {
  readonly trackDeg: number | null;
  readonly groundSpeedKt: number | null;
  readonly onGround: boolean;
}

/** The signed turn from `from` to `to` the short way round, in (-180, 180]. */
function shortestTurn(from: number, to: number): number {
  const turn = ((((to - from) % 360) + 540) % 360) - 180;

  return turn === -180 ? 180 : turn;
}

/**
 * The motion after a snapshot. The same fix as before keeps the previous
 * motion, so a repeated (cached) snapshot neither restarts nor jumps it. A
 * new fix restarts dead reckoning from the reported position and eases away
 * the gap from where the plane is `drawn`, unless that gap is over 20 nm. Its
 * heading turns from the one drawn to the new track (the short way round)
 * over the same time; a fix without a track keeps the drawn heading.
 */
export function nextMotion(
  previous: Motion | undefined,
  fix: Fix,
  drawn: LatLon | null,
  now: number,
): Motion {
  if (
    previous !== undefined &&
    previous.base.lat === fix.lat &&
    previous.base.lon === fix.lon
  ) {
    return fix.trackDeg === null || fix.trackDeg === previous.headingDeg
      ? previous
      : { ...previous, ...turn(previous, fix.trackDeg, now) };
  }
  const base = { lat: fix.lat, lon: fix.lon };
  const velocity =
    fix.onGround || fix.trackDeg === null || fix.groundSpeedKt === null
      ? null
      : { trackDeg: fix.trackDeg, speedKt: fix.groundSpeedKt };
  const eases = drawn !== null && shouldTween(drawn, base);
  const headingDeg =
    fix.trackDeg ?? (previous === undefined ? 0 : motionHeading(previous, now));

  return {
    base,
    baseAt: now,
    velocity,
    offset: eases
      ? { lat: drawn.lat - base.lat, lon: drawn.lon - base.lon }
      : { lat: 0, lon: 0 },
    offsetAt: now,
    ...(previous === undefined
      ? { headingDeg, turnDeg: 0, turnAt: now }
      : turn(previous, headingDeg, now)),
  };
}

/** A turn from where `previous` is heading at `now` to `headingDeg`. */
function turn(
  previous: Motion,
  headingDeg: number,
  now: number,
): Pick<Motion, 'headingDeg' | 'turnDeg' | 'turnAt'> {
  const drawn = motionHeading(previous, now);

  return { headingDeg, turnDeg: -shortestTurn(drawn, headingDeg), turnAt: now };
}

/** How much of a correction started at `since` remains: 1, easing to 0. */
function remaining(since: number, now: number): number {
  const t = clamp((now - since) / CORRECTION_MS, 0, 1);

  return (1 - t) ** 3;
}

/** Where to draw the plane at `now`. */
export function motionPosition(motion: Motion, now: number): LatLon {
  const { base, velocity, offset } = motion;
  const seconds = clamp((now - motion.baseAt) / 1000, 0, MAX_DEAD_RECKON_S);
  const reckoned =
    velocity === null
      ? base
      : deadReckon(base, velocity.trackDeg, velocity.speedKt, seconds);
  const k = remaining(motion.offsetAt, now);

  return {
    lat: reckoned.lat + offset.lat * k,
    lon: reckoned.lon + offset.lon * k,
  };
}

/** The heading to draw the plane at `now`, in degrees from 0 up to 360. */
export function motionHeading(motion: Motion, now: number): number {
  const heading =
    motion.headingDeg + motion.turnDeg * remaining(motion.turnAt, now);

  return ((heading % 360) + 360) % 360;
}

/** True once the plane has stopped moving on screen until the next fix. */
export function motionSettled(motion: Motion, now: number): boolean {
  const corrected =
    (motion.offset.lat === 0 && motion.offset.lon === 0) ||
    now - motion.offsetAt >= CORRECTION_MS;
  const turned = motion.turnDeg === 0 || now - motion.turnAt >= CORRECTION_MS;
  const reckoned =
    motion.velocity === null ||
    motion.velocity.speedKt === 0 ||
    now - motion.baseAt >= MAX_DEAD_RECKON_S * 1000;

  return corrected && turned && reckoned;
}
