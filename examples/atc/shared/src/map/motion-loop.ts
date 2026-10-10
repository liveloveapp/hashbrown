import type * as Leaflet from 'leaflet';
import type { Map as LeafletMap, Marker, Point } from 'leaflet';
import { prefersReducedMotion } from '../dom';
import type { LatLon } from '../places';
import type { AtcState } from '../store';
import { planeRotation } from './plane-marker';
import {
  type Motion,
  motionHeading,
  motionPosition,
  motionSettled,
  nextMotion,
} from './tween';

/** Moves markers smoothly between snapshots. */
export interface MotionLoop {
  /** Takes a new snapshot's fixes and starts animating if anything moves. */
  onSnapshot(state: AtcState): void;
  /** Where a plane is drawn now, or null when it has not been drawn yet. */
  positionOf(hex: string): LatLon | null;
  /**
   * Hands the drawn positions to Leaflet's markers. Call it before Leaflet
   * repositions markers itself (a zoom, a view reset), which it does from
   * each marker's own latitude and longitude, rounded to whole pixels.
   */
  syncMarkers(): void;
  destroy(): void;
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
 * Creates the animation loop. Between snapshots each plane is dead-reckoned
 * along its track and turned towards it ({@link nextMotion}); under reduced
 * motion it jumps to its fix instead. One `requestAnimationFrame` loop draws
 * every moving plane in the same frame at its exact sub-pixel position
 * (`translate3d`, via `L.DomUtil.setPosition`) and heading, without reading
 * layout. Leaflet's markers keep hit-testing and events; their own
 * latitude and longitude are only synced (rounded) when Leaflet needs them
 * ({@link MotionLoop.syncMarkers}). `onFrame` runs after markers are drawn
 * on each frame (the map uses it to keep a followed plane centred and the
 * detail card beside its plane). Frames pause while a zoom animates, and the
 * browser pauses them in a hidden tab; motion is computed from the clock, so
 * planes resume where they should be.
 */
export function createMotionLoop(options: {
  L: typeof Leaflet;
  map: LeafletMap;
  markers: ReadonlyMap<string, Marker>;
  isZooming: () => boolean;
  onFrame: () => void;
}): MotionLoop {
  const { L, map, markers, isZooming, onFrame } = options;
  /** How each plane moves until its next fix; empty under reduced motion. */
  let motions = new Map<string, Motion>();
  /** Where each plane is drawn now. */
  let drawn = new Map<string, LatLon>();
  let frame: number | null = null;
  /**
   * The last frame's timestamp while the loop runs. A fix often lands after
   * a frame began but before it drew; easing from `performance.now()` would
   * then put the plane's start after that frame's timestamp, and it would
   * stand still for a frame. Easing from the last frame keeps it moving.
   */
  let lastFrameAt: number | null = null;

  /** Writes one plane's position and heading; transforms only, no reads. */
  const draw = (hex: string, position: LatLon, heading: number | null) => {
    drawn.set(hex, position);
    const icon = markers.get(hex)?.getElement();
    if (!icon) {
      return;
    }
    L.DomUtil.setPosition(icon, exactLayerPoint(map, position));
    const body = icon.querySelector<HTMLElement>('.atc-plane-body');
    const rotation = heading === null ? null : planeRotation(heading);
    if (body && rotation !== null && body.style.transform !== rotation) {
      body.style.transform = rotation;
    }
  };
  /** Draws every moving plane at `time`; true while any is still moving. */
  const drawMotions = (time: number): boolean => {
    let moving = false;
    for (const [hex, motion] of motions) {
      draw(hex, motionPosition(motion, time), motionHeading(motion, time));
      moving ||= !motionSettled(motion, time);
    }

    return moving;
  };
  const step = (time: number) => {
    frame = null;
    lastFrameAt = time;
    if (isZooming()) {
      frame = requestAnimationFrame(step);
      return;
    }
    const moving = drawMotions(time);
    onFrame();
    if (moving) {
      frame = requestAnimationFrame(step);
    } else {
      lastFrameAt = null;
    }
  };

  return {
    onSnapshot(state) {
      const now =
        frame !== null && lastFrameAt !== null
          ? lastFrameAt
          : performance.now();
      const reduced = prefersReducedMotion();
      const next = new Map<string, Motion>();
      for (const aircraft of state.aircraft.values()) {
        if (!reduced) {
          const { hex } = aircraft;
          next.set(
            hex,
            nextMotion(motions.get(hex), aircraft, drawn.get(hex) ?? null, now),
          );
        }
      }
      motions = next;
      drawn = new Map([...drawn].filter(([hex]) => state.aircraft.has(hex)));
      if (reduced) {
        for (const aircraft of state.aircraft.values()) {
          draw(aircraft.hex, aircraft, aircraft.trackDeg);
        }
        return;
      }
      drawMotions(now);
      if (frame === null && motions.size > 0) {
        frame = requestAnimationFrame(step);
      }
    },
    positionOf: (hex) => drawn.get(hex) ?? null,
    syncMarkers() {
      for (const [hex, position] of drawn) {
        markers.get(hex)?.setLatLng([position.lat, position.lon]);
      }
    },
    destroy() {
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
    },
  };
}
