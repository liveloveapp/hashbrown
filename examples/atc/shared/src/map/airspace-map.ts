import type { Map as LeafletMap, Marker } from 'leaflet';
import type { Aircraft } from '../aircraft';
import type { Area, LatLon } from '../places';
import type { AtcState, AtcStore } from '../store';
import {
  lerpLatLon,
  shouldTween,
  tweenDurationMs,
  tweenProgress,
} from './tween';

/**
 * Raster tiles from Stadia Maps. Stadia authenticates by domain, so no key
 * ships in the page; localhost works without registration.
 */
export const TILE_LAYER = {
  url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png',
  attribution:
    '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Aircraft data <a href="https://adsb.lol">adsb.lol</a> (ODbL)',
};

/** CSS classes for one aircraft marker. */
export function markerClassName(state: AtcState, hex: string): string {
  const classes = ['atc-plane'];
  if (state.selectedHex === hex) {
    classes.push('is-selected');
  }
  if (state.followingHex === hex) {
    classes.push('is-followed');
  }
  if (state.highlighted.size > 0 && !state.highlighted.has(hex)) {
    classes.push('is-dimmed');
  }

  return classes.join(' ');
}

/**
 * Marker HTML. Hex codes and callsigns are validated by the aircraft model
 * (hex digits; letters and digits), so they are safe to interpolate.
 */
export function planeIconHtml(aircraft: Aircraft, className: string): string {
  const rotation = Math.round(aircraft.trackDeg ?? 0);

  return `<div class="${className}" data-hex="${aircraft.hex}" data-callsign="${aircraft.callsign}" style="transform: rotate(${rotation}deg)"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 2l1.6 6.4L21 13v2l-7.3-2.2-.7 5.4 2.5 1.8V21L12 20l-3.5 1v-1l2.5-1.8-.7-5.4L3 15v-2l7.4-4.6z"/></svg></div>`;
}

/**
 * Whether the map should pan to a followed aircraft: only when its position
 * differs from where the map last panned, so unrelated store updates (or a
 * user drag) do not pull the view back.
 */
export function followPanTarget(
  last: { lat: number; lon: number } | null,
  next: { lat: number; lon: number },
): boolean {
  return last === null || last.lat !== next.lat || last.lon !== next.lon;
}

/** A mounted map. */
export interface AirspaceMapHandle {
  /** Stops syncing with the store and removes the map. */
  destroy(): void;
}

/** True when the user asked the system to minimise motion. */
function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Mounts a Leaflet map in `element` and keeps its markers in sync with the
 * store. Leaflet is imported lazily so server bundles never load it.
 *
 * When a new snapshot arrives, each known marker glides from where it is
 * drawn to its new position over the time since the previous snapshot, so
 * planes move continuously between updates. New markers, moves over 20 nm and
 * reduced-motion users jump instead. A followed plane is panned with its glide.
 *
 * Pass `signal` to cancel before the import settles: when it is already
 * aborted by then, no map is created and the handle's `destroy` is a no-op.
 */
export async function createAirspaceMap(options: {
  element: HTMLElement;
  store: AtcStore;
  area: Area;
  signal?: AbortSignal;
}): Promise<AirspaceMapHandle> {
  const { element, store, area, signal } = options;
  const module = await import('leaflet');
  if (signal?.aborted) {
    return {
      destroy() {
        // Nothing was created.
      },
    };
  }
  const L =
    (module as unknown as { default?: typeof module }).default ?? module;
  const map: LeafletMap = L.map(element, { zoomControl: false }).setView(
    [area.lat, area.lon],
    area.zoom,
  );
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.tileLayer(TILE_LAYER.url, {
    attribution: TILE_LAYER.attribution,
    maxZoom: 18,
  }).addTo(map);
  const icon = (html: string) =>
    L.divIcon({
      html,
      className: 'atc-plane-icon',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
  const markers = new Map<string, { marker: Marker; html: string }>();
  let lastPulseAt: number | null = null;
  let lastPan: LatLon | null = null;
  let lastUpdatedAt: number | null = null;
  let lastArrival: number | null = null;
  let glide: {
    readonly startedAt: number;
    readonly durationMs: number;
    readonly moves: ReadonlyMap<string, { from: LatLon; to: LatLon }>;
  } | null = null;
  let frame: number | null = null;
  map.on('dragstart', () => store.follow(null));

  const drawnAt = (hex: string): LatLon | null => {
    const position = markers.get(hex)?.marker.getLatLng();

    return position ? { lat: position.lat, lon: position.lng } : null;
  };
  const panToFollowed = (animate: boolean) => {
    const { followingHex } = store.getState();
    const target = followingHex === null ? null : drawnAt(followingHex);
    if (target && followPanTarget(lastPan, target)) {
      map.panTo([target.lat, target.lon], { animate });
    }
    lastPan = target;
  };
  const step = (time: number) => {
    if (glide === null) {
      return;
    }
    const t = tweenProgress(glide.startedAt, glide.durationMs, time);
    for (const [hex, { from, to }] of glide.moves) {
      const { lat, lon } = lerpLatLon(from, to, t);
      markers.get(hex)?.marker.setLatLng([lat, lon]);
    }
    panToFollowed(false);
    frame = t < 1 ? requestAnimationFrame(step) : null;
  };
  /** Starts gliding known markers to a new snapshot's positions. */
  const moveMarkers = (state: AtcState) => {
    const now = performance.now();
    const durationMs = prefersReducedMotion()
      ? 0
      : tweenDurationMs(lastArrival, now);
    lastArrival = now;
    const moves = new Map<string, { from: LatLon; to: LatLon }>();
    for (const aircraft of state.aircraft.values()) {
      const from = drawnAt(aircraft.hex);
      const to = { lat: aircraft.lat, lon: aircraft.lon };
      if (from && durationMs > 0 && shouldTween(from, to)) {
        moves.set(aircraft.hex, { from, to });
      } else {
        markers.get(aircraft.hex)?.marker.setLatLng([to.lat, to.lon]);
      }
    }
    glide = { startedAt: now, durationMs, moves };
    if (frame === null && moves.size > 0) {
      frame = requestAnimationFrame(step);
    }
  };

  const render = (state: AtcState) => {
    for (const [hex, entry] of markers) {
      if (!state.aircraft.has(hex)) {
        entry.marker.remove();
        markers.delete(hex);
      }
    }
    if (state.updatedAt !== lastUpdatedAt) {
      lastUpdatedAt = state.updatedAt;
      moveMarkers(state);
    }
    for (const aircraft of state.aircraft.values()) {
      const html = planeIconHtml(
        aircraft,
        markerClassName(state, aircraft.hex),
      );
      const existing = markers.get(aircraft.hex);
      if (existing) {
        if (existing.html !== html) {
          existing.marker.setIcon(icon(html));
          markers.set(aircraft.hex, { marker: existing.marker, html });
        }
      } else {
        const marker = L.marker([aircraft.lat, aircraft.lon], {
          icon: icon(html),
          keyboard: false,
          title: aircraft.callsign,
        })
          .on('click', () => store.select(aircraft.hex))
          .addTo(map);
        markers.set(aircraft.hex, { marker, html });
      }
    }
    panToFollowed(true);
    if (state.pulse !== null && state.pulse.at !== lastPulseAt) {
      lastPulseAt = state.pulse.at;
      const plane = markers
        .get(state.pulse.hex)
        ?.marker.getElement()
        ?.querySelector('.atc-plane');
      plane?.classList.remove('is-pulsing');
      void plane?.getBoundingClientRect();
      plane?.classList.add('is-pulsing');
    }
  };

  render(store.getState());
  const unsubscribe = store.subscribe(() => render(store.getState()));

  return {
    destroy() {
      unsubscribe();
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
      map.remove();
    },
  };
}
