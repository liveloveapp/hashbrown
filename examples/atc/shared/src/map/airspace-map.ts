import type { Circle, Map as LeafletMap, Marker } from 'leaflet';
import type { Aircraft } from '../aircraft';
import { type AircraftKind, KIND_PATHS } from '../kinds';
import { AIRPORTS, type Area, type LatLon } from '../places';
import type { AtcState, AtcStore, ShownArea } from '../store';
import { aircraftDetailView } from '../detail-view';
import { isTyping } from '../dom';
import {
  CARD_MARGIN,
  type CardSize,
  createDetailCard,
  isInsideArea,
  visibleMapArea,
} from './detail-card';
import { circleBounds, type FitTarget, fitTarget } from './fit';
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
  if (state.highlighted.size > 0) {
    classes.push(state.highlighted.has(hex) ? 'is-highlighted' : 'is-dimmed');
  }

  return classes.join(' ');
}

/**
 * The parts of a plane's data tag: the label, and the altitude in feet
 * ("4,200"), "GND" on the ground, or null when unknown (the tag then shows the
 * label alone).
 */
function planeTagParts(
  aircraft: Pick<Aircraft, 'label' | 'altitudeFt' | 'onGround'>,
): { label: string; altitude: string | null } {
  const altitude = aircraft.onGround
    ? 'GND'
    : aircraft.altitudeFt === null
      ? null
      : aircraft.altitudeFt.toLocaleString('en-US');

  return { label: aircraft.label, altitude };
}

/**
 * Text of a plane's data tag, exactly as rendered: label and altitude in
 * feet separated by a space, such as "ASA123 4,200", "N352LL GND" on the
 * ground, or just "ASA123" when the altitude is unknown. Built only from
 * validated fields.
 */
export function planeTagText(
  aircraft: Pick<Aircraft, 'label' | 'altitudeFt' | 'onGround'>,
): string {
  const { label, altitude } = planeTagParts(aircraft);

  return altitude === null ? label : `${label} ${altitude}`;
}

/** Classes the store drives; toggled in place, leaving others (is-pulsing). */
const STATE_CLASSES = [
  'is-selected',
  'is-followed',
  'is-highlighted',
  'is-dimmed',
];

/** The silhouette SVG for a kind; the path comes from a closed table. */
function silhouetteSvg(kind: AircraftKind): string {
  return `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="${KIND_PATHS[kind]}"/></svg>`;
}

/**
 * Updates an existing marker in place: state classes, rotation, label and
 * tag text (via `textContent`), so the marker is never rebuilt and its pulse
 * and hover survive live track and altitude jitter. Writes only what changed.
 */
export function updatePlane(
  element: HTMLElement | undefined,
  aircraft: Aircraft,
  className: string,
) {
  const plane = element?.querySelector('.atc-plane');
  if (!plane) {
    return;
  }
  const wanted = className.split(' ');
  for (const name of STATE_CLASSES) {
    plane.classList.toggle(name, wanted.includes(name));
  }
  if (plane.getAttribute('data-label') !== aircraft.label) {
    plane.setAttribute('data-label', aircraft.label);
  }
  const body = plane.querySelector<HTMLElement>('.atc-plane-body');
  if (body && body.getAttribute('data-kind') !== aircraft.kind) {
    body.setAttribute('data-kind', aircraft.kind);
    body.innerHTML = silhouetteSvg(aircraft.kind);
  }
  const transform = `rotate(${Math.round(aircraft.trackDeg ?? 0)}deg)`;
  if (body && body.style.transform !== transform) {
    body.style.transform = transform;
  }
  const tag = plane.querySelector('.atc-plane-tag');
  const alt = tag?.querySelector('.atc-plane-alt');
  if (!tag || !alt) {
    return;
  }
  const { label, altitude } = planeTagParts(aircraft);
  const altText = altitude === null ? '' : ` ${altitude}`;
  if (
    tag.firstChild &&
    tag.firstChild !== alt &&
    tag.firstChild.textContent !== label
  ) {
    tag.firstChild.textContent = label;
  }
  if (alt.textContent !== altText) {
    alt.textContent = altText;
  }
}

/** Tag markup: the label, then the altitude in a muted monospace span. */
function tag(aircraft: Aircraft): string {
  const { label, altitude } = planeTagParts(aircraft);

  return `${label}<span class="atc-plane-alt">${altitude === null ? '' : ` ${altitude}`}</span>`;
}

/**
 * Marker HTML: the silhouette for the aircraft's kind (rotated to the track) and a data tag that stays
 * upright beside it. Hex codes and labels are validated by the aircraft
 * model (`^[0-9a-f]{6}$`; `^[A-Z0-9]{1,8}$`), the kind is from a closed set, and altitude is a number, so they
 * are safe to interpolate.
 */
export function planeIconHtml(aircraft: Aircraft, className: string): string {
  const rotation = Math.round(aircraft.trackDeg ?? 0);

  return `<div class="${className}" data-hex="${aircraft.hex}" data-label="${aircraft.label}"><div class="atc-plane-body" data-kind="${aircraft.kind}" style="transform: rotate(${rotation}deg)">${silhouetteSvg(aircraft.kind)}</div><span class="atc-plane-tag">${tag(aircraft)}</span></div>`;
}

/** A point in map container pixels. */
export interface PixelPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * How far to pan, in whole pixels, to put a followed plane drawn at `point`
 * back in the map's `centre`, or null when it is less than 1 px away. Leaflet
 * pans by whole pixels, so smaller offsets would be dropped.
 */
export function followPanOffset(
  point: PixelPoint,
  centre: PixelPoint,
): PixelPoint | null {
  const x = point.x - centre.x;
  const y = point.y - centre.y;

  return Math.hypot(x, y) < 1
    ? null
    : { x: Math.round(x) || 0, y: Math.round(y) || 0 };
}

/** Furthest out, and furthest in, that fitting highlighted planes will zoom. */
const MIN_FIT_ZOOM = 5;
const MAX_FIT_ZOOM = 10;
/** Furthest in that showing an area will zoom. */
const MAX_AREA_ZOOM = 12;
/** Space kept around a shown area, in pixels. */
const AREA_PADDING = 24;
/** Metres in a nautical mile, for Leaflet's circle radius. */
const METRES_PER_NM = 1852;

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
 * Hovering a plane, or selecting it, opens one floating detail card beside
 * it that follows its glide and updates in place on each snapshot. Leaving
 * the plane hides the card unless it is selected; Escape (outside text
 * fields) or a click on the empty map clears the selection. On phones the
 * card stays above the bottom sheet, and it hides when the plane is off
 * screen or there is no room.
 *
 * The map moves only for view requests in the store (see `requestArea`):
 * fitting a new highlighted set, showing an area (with a faint outline) or
 * resetting to `area`. The newest request wins; follow mode wins over all
 * of them; a user drag or zoom cancels one still waiting (a highlight whose
 * planes have no markers yet). Moves animate unless reduced motion is set.
 *
 * Pass `signal` to cancel before the import settles: when it is already
 * aborted by then, no map is created and the handle's `destroy` is a no-op.
 * The map re-measures itself whenever `element` changes size.
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
  const reduced = prefersReducedMotion();
  const map: LeafletMap = L.map(element, {
    zoomControl: false,
    zoomAnimation: !reduced,
    fadeAnimation: !reduced,
    markerZoomAnimation: !reduced,
  }).setView([area.lat, area.lon], area.zoom);
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
  const markers = new Map<string, { marker: Marker }>();
  let lastPulseAt: number | null = null;
  let zooming = false;
  let panning = false;
  let lastUpdatedAt: number | null = null;
  let lastArrival: number | null = null;
  let glide: {
    readonly startedAt: number;
    readonly durationMs: number;
    readonly moves: ReadonlyMap<string, { from: LatLon; to: LatLon }>;
  } | null = null;
  let frame: number | null = null;
  /** The newest view request already applied (or dropped). */
  let appliedSeq: number | null = null;
  /** True while this controller moves the map, so its zooms do not cancel. */
  let programmatic = false;
  /** The drawn area outline. */
  let outline: { readonly area: ShownArea; readonly layer: Circle } | null =
    null;
  // The class, not `L.svg()`, which returns null where SVG is not detected.
  const outlineRenderer = new L.SVG({ padding: 0.5 });
  const doc = element.ownerDocument;
  const card = createDetailCard(doc);
  element.append(card.element);
  /** The plane under the pointer, and the plane the card is showing. */
  let hoveredHex: string | null = null;
  let detailedHex: string | null = null;
  /** The part of the map not under the phone's bottom sheet. */
  let cardArea: CardSize = { width: 0, height: 0 };
  map.on('dragstart', () => {
    store.follow(null);
    store.cancelViewRequest();
  });
  map.on('zoomstart', () => {
    zooming = true;
    if (!programmatic) {
      store.cancelViewRequest();
    }
    syncCard(store.getState());
  });
  map.on('zoomend', () => {
    zooming = false;
    syncCard(store.getState());
    panToFollowed(true);
  });
  map.on('move', () => syncCard(store.getState()));
  map.on('click', () => {
    if (store.getState().selectedHex !== null) {
      store.select(null);
    }
  });
  const onKeydown = (event: KeyboardEvent) => {
    if (
      event.key === 'Escape' &&
      !event.defaultPrevented &&
      !isTyping(event.target) &&
      store.getState().selectedHex !== null
    ) {
      store.select(null);
    }
  };
  doc.addEventListener('keydown', onKeydown);

  /** The chat panel, which is a bottom sheet over the map on phones. */
  const sheet = () =>
    element.closest('.atc-workbench')?.querySelector('.atc-chat-panel') ?? null;
  /**
   * Re-measures the area the card may use. Called on resize and whenever
   * the sheet changes size, never per frame.
   */
  const measureArea = () => {
    const size = map.getSize();
    const box = element.getBoundingClientRect();
    const panel = sheet()?.getBoundingClientRect();
    cardArea = visibleMapArea(
      { left: 0, top: 0, right: size.x, bottom: size.y },
      panel
        ? {
            left: panel.left - box.left,
            top: panel.top - box.top,
            right: panel.right - box.left,
            bottom: panel.bottom - box.top,
          }
        : null,
    );
  };
  const planeElement = (hex: string | null) =>
    hex === null
      ? null
      : markers.get(hex)?.marker.getElement()?.querySelector('.atc-plane');
  /**
   * Shows the card beside the hovered plane, else the selected one, and
   * hides it when there is none, the plane is off screen or under the sheet,
   * a zoom is animating, or the card does not fit. The plane it describes
   * drops its own tag, which the card repeats.
   */
  const syncCard = (state: AtcState) => {
    const hex = hoveredHex ?? state.selectedHex;
    const position =
      hex === null ? undefined : markers.get(hex)?.marker.getLatLng();
    const point =
      position && !zooming ? map.latLngToContainerPoint(position) : null;
    const view =
      hex !== null && point !== null && isInsideArea(point, cardArea)
        ? aircraftDetailView(state, hex, Date.now())
        : null;
    const shown =
      view !== null && card.show(view, cardArea.height - 2 * CARD_MARGIN);
    const next = shown ? view.hex : null;
    if (next !== detailedHex) {
      planeElement(detailedHex)?.classList.remove('is-detailed');
      planeElement(next)?.classList.add('is-detailed');
      detailedHex = next;
    }
    if (!shown || point === null) {
      card.hide();
      return;
    }
    card.place(point, cardArea);
  };
  // Counts the card's message age up between snapshots.
  const ticker = setInterval(() => {
    if (detailedHex !== null) {
      syncCard(store.getState());
    }
  }, 1000);

  const drawnAt = (hex: string): LatLon | null => {
    const position = markers.get(hex)?.marker.getLatLng();

    return position ? { lat: position.lat, lon: position.lng } : null;
  };
  /**
   * Pans so the followed plane is back in the centre, unless it already is
   * (within 1 px) or a zoom or an animated pan is still running.
   */
  const panToFollowed = (animate: boolean) => {
    const { followingHex } = store.getState();
    const position =
      followingHex === null
        ? undefined
        : markers.get(followingHex)?.marker.getLatLng();
    if (!position || zooming || panning) {
      return;
    }
    const offset = followPanOffset(
      map.latLngToContainerPoint(position),
      map.getSize().divideBy(2),
    );
    if (offset === null) {
      return;
    }
    if (animate) {
      panning = true;
      map.once('moveend', () => (panning = false));
    }
    map.panBy([offset.x, offset.y], { animate });
  };
  /** Runs a map move this controller makes, so it is not taken for the user's. */
  const moveMap = (move: () => void) => {
    programmatic = true;
    try {
      move();
    } finally {
      programmatic = false;
    }
  };
  /** Moves the map so highlighted planes and their tags are legible. */
  const fitHighlight = (target: FitTarget, animate: boolean) => {
    if (target.kind === 'point') {
      map.setView([target.lat, target.lon], target.zoom, { animate });
      return;
    }
    const bounds: [[number, number], [number, number]] = [
      [target.south, target.west],
      [target.north, target.east],
    ];
    // Extra room on the right for the data tags.
    const paddingTopLeft: [number, number] = [48, 48];
    const paddingBottomRight: [number, number] = [140, 48];
    const zoom = map.getBoundsZoom(
      bounds,
      false,
      L.point(
        paddingTopLeft[0] + paddingBottomRight[0],
        paddingTopLeft[1] + paddingBottomRight[1],
      ),
    );
    if (zoom < MIN_FIT_ZOOM) {
      map.setView(L.latLngBounds(bounds).getCenter(), MIN_FIT_ZOOM, {
        animate,
      });
      return;
    }
    map.fitBounds(bounds, {
      paddingTopLeft,
      paddingBottomRight,
      maxZoom: MAX_FIT_ZOOM,
      animate,
    });
  };
  /** Fits a circle around an airport, keeping it above a phone's sheet. */
  const fitArea = (shown: ShownArea, animate: boolean) => {
    const box = circleBounds(AIRPORTS[shown.airport], shown.radiusNm);
    const hidden = map.getSize().y - cardArea.height;
    const bottom = cardArea.height > 160 ? hidden : 0;
    map.fitBounds(
      [
        [box.south, box.west],
        [box.north, box.east],
      ],
      {
        paddingTopLeft: [AREA_PADDING, AREA_PADDING],
        paddingBottomRight: [AREA_PADDING, AREA_PADDING + bottom],
        maxZoom: MAX_AREA_ZOOM,
        animate,
      },
    );
  };
  /**
   * Applies the newest view request once. Follow mode drops it. A highlight
   * fit waits until at least one of its planes has a marker.
   */
  const applyView = (state: AtcState) => {
    const request = state.viewRequest;
    if (request === null || request.seq === appliedSeq) {
      return;
    }
    if (state.followingHex !== null) {
      appliedSeq = request.seq;
      return;
    }
    const animate = !prefersReducedMotion();
    if (request.kind === 'highlight') {
      const positions = new Map<string, LatLon>();
      for (const hex of state.highlighted) {
        const position = drawnAt(hex);
        if (position) {
          positions.set(hex, position);
        }
      }
      const target = fitTarget(new Set(), state.highlighted, positions, false);
      if (target === null) {
        return;
      }
      appliedSeq = request.seq;
      moveMap(() => fitHighlight(target, animate));
      return;
    }
    appliedSeq = request.seq;
    moveMap(() =>
      request.kind === 'area'
        ? fitArea(request.area, animate)
        : map.setView([area.lat, area.lon], area.zoom, { animate }),
    );
  };
  /** Draws the shown area's outline, or removes it. */
  const syncOutline = (shown: ShownArea | null) => {
    if (outline?.area === shown) {
      return;
    }
    outline?.layer.remove();
    outline = null;
    if (shown === null) {
      return;
    }
    const centre = AIRPORTS[shown.airport];
    const layer = L.circle([centre.lat, centre.lon], {
      radius: shown.radiusNm * METRES_PER_NM,
      className: 'atc-area',
      renderer: outlineRenderer,
      fill: false,
      weight: 1,
      interactive: false,
    }).addTo(map);
    outline = { area: shown, layer };
  };
  /** Last drawn pixel of each gliding marker, to skip sub-pixel moves. */
  let drawnPixels = new Map<string, string>();
  const step = (time: number) => {
    if (glide === null) {
      return;
    }
    const t = tweenProgress(glide.startedAt, glide.durationMs, time);
    if (!zooming) {
      for (const [hex, { from, to }] of glide.moves) {
        const { lat, lon } = lerpLatLon(from, to, t);
        const pixel = map.latLngToLayerPoint([lat, lon]).round().toString();
        if (t >= 1 || drawnPixels.get(hex) !== pixel) {
          drawnPixels.set(hex, pixel);
          markers.get(hex)?.marker.setLatLng([lat, lon]);
        }
      }
      panToFollowed(false);
      syncCard(store.getState());
    }
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
    drawnPixels = new Map();
    if (frame === null && moves.size > 0) {
      frame = requestAnimationFrame(step);
    }
  };

  const render = (state: AtcState) => {
    for (const [hex, entry] of markers) {
      if (!state.aircraft.has(hex)) {
        entry.marker.remove();
        markers.delete(hex);
        hoveredHex = hoveredHex === hex ? null : hoveredHex;
      }
    }
    if (state.updatedAt !== lastUpdatedAt) {
      lastUpdatedAt = state.updatedAt;
      moveMarkers(state);
    }
    for (const aircraft of state.aircraft.values()) {
      const className = markerClassName(state, aircraft.hex);
      const existing = markers.get(aircraft.hex);
      if (existing) {
        updatePlane(existing.marker.getElement(), aircraft, className);
      } else {
        const marker = L.marker([aircraft.lat, aircraft.lon], {
          icon: icon(planeIconHtml(aircraft, className)),
          keyboard: false,
        })
          .on('click', () => store.select(aircraft.hex))
          .on('mouseover', () => {
            hoveredHex = aircraft.hex;
            syncCard(store.getState());
          })
          .on('mouseout', () => {
            hoveredHex = hoveredHex === aircraft.hex ? null : hoveredHex;
            syncCard(store.getState());
          })
          .addTo(map);
        markers.set(aircraft.hex, { marker });
      }
    }
    syncCard(state);
    syncOutline(state.shownArea);
    applyView(state);
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

  measureArea();
  render(store.getState());
  const unsubscribe = store.subscribe(() => render(store.getState()));
  // Leaflet only re-measures on window resize; rotation and layout changes
  // (a bottom sheet, a panel) resize the container without one.
  const resizeObserver =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
          map.invalidateSize();
          measureArea();
          syncCard(store.getState());
        })
      : null;
  resizeObserver?.observe(element);
  // The sheet's height (peek or expanded) decides how much map is visible.
  const panel = sheet();
  if (panel) {
    resizeObserver?.observe(panel);
  }
  const onResize = () => {
    measureArea();
    syncCard(store.getState());
  };
  const view = doc.defaultView;
  view?.addEventListener('resize', onResize);
  view?.visualViewport?.addEventListener('resize', onResize);

  return {
    destroy() {
      resizeObserver?.disconnect();
      unsubscribe();
      doc.removeEventListener('keydown', onKeydown);
      view?.removeEventListener('resize', onResize);
      view?.visualViewport?.removeEventListener('resize', onResize);
      clearInterval(ticker);
      card.element.remove();
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
      map.remove();
    },
  };
}
