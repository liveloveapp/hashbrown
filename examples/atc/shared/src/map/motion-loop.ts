import type { Map as LeafletMap, Marker } from 'leaflet';
import { prefersReducedMotion } from '../dom';
import type { LatLon } from '../places';
import type { AtcState } from '../store';
import {
  type Motion,
  motionPosition,
  motionSettled,
  nextMotion,
} from './tween';

/** Moves markers smoothly between snapshots. */
export interface MotionLoop {
  /** Takes a new snapshot's fixes and starts animating if anything moves. */
  onSnapshot(state: AtcState): void;
  destroy(): void;
}

/**
 * Creates the animation loop. Between snapshots each plane is dead-reckoned
 * along its track ({@link nextMotion}); under reduced motion it jumps to its
 * fix instead. `onFrame` runs after markers are drawn on each frame (the map
 * uses it to keep a followed plane centred and the detail card beside its
 * plane). Frames pause while a zoom animates.
 */
export function createMotionLoop(options: {
  map: LeafletMap;
  markers: ReadonlyMap<string, Marker>;
  drawnAt: (hex: string) => LatLon | null;
  isZooming: () => boolean;
  onFrame: () => void;
}): MotionLoop {
  const { map, markers, drawnAt, isZooming, onFrame } = options;
  /** How each plane moves until its next fix; empty under reduced motion. */
  let motions = new Map<string, Motion>();
  /** Last drawn pixel of each moving marker, to skip sub-pixel moves. */
  let drawnPixels = new Map<string, string>();
  let frame: number | null = null;

  /** Draws every moving marker at `time`; true while any is still moving. */
  const drawMotions = (time: number): boolean => {
    let moving = false;
    for (const [hex, motion] of motions) {
      const settled = motionSettled(motion, time);
      const { lat, lon } = motionPosition(motion, time);
      const pixel = map.latLngToLayerPoint([lat, lon]).round().toString();
      if (settled || drawnPixels.get(hex) !== pixel) {
        drawnPixels.set(hex, pixel);
        markers.get(hex)?.setLatLng([lat, lon]);
      }
      moving ||= !settled;
    }

    return moving;
  };
  const step = (time: number) => {
    frame = null;
    if (isZooming()) {
      frame = requestAnimationFrame(step);
      return;
    }
    const moving = drawMotions(time);
    onFrame();
    if (moving) {
      frame = requestAnimationFrame(step);
    }
  };

  return {
    onSnapshot(state) {
      const now = performance.now();
      if (prefersReducedMotion()) {
        motions = new Map();
        for (const aircraft of state.aircraft.values()) {
          markers.get(aircraft.hex)?.setLatLng([aircraft.lat, aircraft.lon]);
        }
        return;
      }
      const next = new Map<string, Motion>();
      for (const aircraft of state.aircraft.values()) {
        next.set(
          aircraft.hex,
          nextMotion(
            motions.get(aircraft.hex),
            aircraft,
            drawnAt(aircraft.hex),
            now,
          ),
        );
      }
      motions = next;
      drawnPixels = new Map();
      drawMotions(now);
      if (frame === null && motions.size > 0) {
        frame = requestAnimationFrame(step);
      }
    },
    destroy() {
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
    },
  };
}
