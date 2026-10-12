import type { Map as LeafletMap, Point } from 'leaflet';
import type { LatLon } from '../places';

/** A point in map container pixels. */
export interface PixelPoint {
  readonly x: number;
  readonly y: number;
}

/** A rectangle in pixels, by its edges, as `getBoundingClientRect` gives. */
export interface PixelRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** True when two rectangles overlap, or come closer than `gap` pixels. */
export function intersects(a: PixelRect, b: PixelRect, gap = 0): boolean {
  return (
    a.left < b.right + gap &&
    b.left < a.right + gap &&
    a.top < b.bottom + gap &&
    b.top < a.bottom + gap
  );
}

/** True when `inner` lies wholly inside `outer`. */
export function contains(outer: PixelRect, inner: PixelRect): boolean {
  return (
    inner.left >= outer.left &&
    inner.top >= outer.top &&
    inner.right <= outer.right &&
    inner.bottom <= outer.bottom
  );
}

/** A `width` x `height` rectangle whose top-left corner is (`left`, `top`). */
export function rectAt(
  left: number,
  top: number,
  width: number,
  height: number,
): PixelRect {
  return { left, top, right: left + width, bottom: top + height };
}

/** A `width` x `height` rectangle centred on (`x`, `y`). */
export function rectAround(
  x: number,
  y: number,
  width: number,
  height = width,
): PixelRect {
  return rectAt(x - width / 2, y - height / 2, width, height);
}

/**
 * Where `position` falls in the map's layer, in unrounded pixels. Leaflet's
 * own `latLngToLayerPoint` rounds to whole pixels; at regional zooms a plane
 * moves well under a pixel a frame, so rounding makes it stand still and
 * then hop, each plane at a different moment.
 */
export function exactLayerPoint(map: LeafletMap, position: LatLon): Point {
  return map
    .project([position.lat, position.lon], map.getZoom())
    .subtract(map.getPixelOrigin());
}

/**
 * Where `position` is drawn in the map's container, in unrounded pixels (see
 * {@link exactLayerPoint}).
 */
export function exactContainerPoint(
  map: LeafletMap,
  position: LatLon,
): PixelPoint {
  return map.layerPointToContainerPoint(exactLayerPoint(map, position));
}
