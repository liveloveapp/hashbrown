import { distanceNm } from '../geo';
import type { LatLon } from '../places';

/** Moves longer than this jump instead of gliding (data gaps, bad fixes). */
const MAX_TWEEN_NM = 20;
const MIN_TWEEN_MS = 250;
const MAX_TWEEN_MS = 10_000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** The point a fraction `t` (clamped to 0..1) of the way from `from` to `to`. */
export function lerpLatLon(from: LatLon, to: LatLon, t: number): LatLon {
  const k = clamp(t, 0, 1);

  return {
    lat: from.lat + (to.lat - from.lat) * k,
    lon: from.lon + (to.lon - from.lon) * k,
  };
}

/** True when a marker should glide from `from` to `to`: it moved, by at most 20 nm. */
export function shouldTween(from: LatLon, to: LatLon): boolean {
  const distance = distanceNm(from, to);

  return distance > 0 && distance <= MAX_TWEEN_NM;
}

/**
 * How long markers glide to a new snapshot: the wall-clock gap since the
 * previous snapshot arrived, clamped to 250 to 10,000 ms, so planes keep
 * moving until the next update. 0 (no glide) for the first snapshot.
 */
export function tweenDurationMs(
  previousArrival: number | null,
  now: number,
): number {
  return previousArrival === null
    ? 0
    : clamp(now - previousArrival, MIN_TWEEN_MS, MAX_TWEEN_MS);
}

/** How far through a glide that started at `startedAt` we are, from 0 to 1. */
export function tweenProgress(
  startedAt: number,
  durationMs: number,
  now: number,
): number {
  return durationMs <= 0 ? 1 : clamp((now - startedAt) / durationMs, 0, 1);
}
