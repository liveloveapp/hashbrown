import type { LatLon } from '../places';

/** Feet to metres. */
export const FT_TO_M = 0.3048;
const EARTH_M = 6_371_008.8;
const RAD = Math.PI / 180;

/** Metres east and north of `origin`, on a local flat projection. */
function toLocal(origin: LatLon, point: LatLon): [number, number] {
  const x =
    (point.lon - origin.lon) * RAD * EARTH_M * Math.cos(origin.lat * RAD);
  const y = (point.lat - origin.lat) * RAD * EARTH_M;

  return [x, y];
}

function fromLocal(origin: LatLon, [x, y]: [number, number]): LatLon {
  return {
    lat: origin.lat + y / EARTH_M / RAD,
    lon: origin.lon + x / (EARTH_M * Math.cos(origin.lat * RAD)) / RAD,
  };
}

/** True bearing from `a` to `b` in degrees, 0 to 360. */
export function bearingDeg(a: LatLon, b: LatLon): number {
  const [x, y] = toLocal(a, b);

  return (Math.atan2(x, y) / RAD + 360) % 360;
}

/**
 * The four corners of a runway `widthFt` wide between threshold `a` and
 * threshold `b`, in order a-left, b-left, b-right, a-right.
 */
export function runwayCorners(a: LatLon, b: LatLon, widthFt: number): LatLon[] {
  const [bx, by] = toLocal(a, b);
  const length = Math.hypot(bx, by);
  const half = (widthFt * FT_TO_M) / 2;
  // Unit normal to the left of a->b.
  const nx = length === 0 ? 0 : -by / length;
  const ny = length === 0 ? 0 : bx / length;

  return [
    fromLocal(a, [nx * half, ny * half]),
    fromLocal(a, [bx + nx * half, by + ny * half]),
    fromLocal(a, [bx - nx * half, by - ny * half]),
    fromLocal(a, [-nx * half, -ny * half]),
  ];
}

/** Ground metres per CSS pixel on a Web Mercator map at `zoom` and `lat`. */
export function metresPerPixel(zoom: number, lat: number): number {
  return (40_075_016.686 * Math.cos(lat * RAD)) / (256 * 2 ** zoom);
}
