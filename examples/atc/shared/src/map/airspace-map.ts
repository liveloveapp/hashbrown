import type { Map as LeafletMap, Marker } from 'leaflet';
import type { Aircraft } from '../aircraft';
import type { Area } from '../places';
import type { AtcState, AtcStore } from '../store';

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

/** A mounted map. */
export interface AirspaceMapHandle {
  /** Stops syncing with the store and removes the map. */
  destroy(): void;
}

/**
 * Mounts a Leaflet map in `element` and keeps its markers in sync with the
 * store. Leaflet is imported lazily so server bundles never load it.
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

  const render = (state: AtcState) => {
    for (const [hex, entry] of markers) {
      if (!state.aircraft.has(hex)) {
        entry.marker.remove();
        markers.delete(hex);
      }
    }
    for (const aircraft of state.aircraft.values()) {
      const html = planeIconHtml(
        aircraft,
        markerClassName(state, aircraft.hex),
      );
      const existing = markers.get(aircraft.hex);
      if (existing) {
        existing.marker.setLatLng([aircraft.lat, aircraft.lon]);
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
    const followed =
      state.followingHex === null
        ? undefined
        : state.aircraft.get(state.followingHex);
    if (followed) {
      map.panTo([followed.lat, followed.lon], { animate: true });
    }
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
      map.remove();
    },
  };
}
