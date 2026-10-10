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
  detailCardDocked,
  isInsideArea,
  visibleMapArea,
} from './detail-card';
import { circleBounds, type FitTarget, fitTarget } from './fit';
import {
  createFollowPill,
  followPillView,
  type FollowResume,
  RESUME_MS,
} from './follow-pill';
import {
  type Motion,
  motionPosition,
  motionSettled,
  nextMotion,
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

/** At this zoom and below, markers are drawn smaller. */
const LOW_ZOOM = 6;
/** Furthest out, and furthest in, that fitting highlighted planes will zoom. */
const MIN_FIT_ZOOM = 5;
const MAX_FIT_ZOOM = 10;
/** The least zoom a plane picked in the chat is shown at. */
const REVEAL_ZOOM = 8;
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
 * Between snapshots each plane is dead-reckoned along its track at its
 * ground speed (for up to 15 s past its latest fix), so traffic moves
 * continuously although the feed updates every few seconds. A new fix eases
 * away the gap from where the plane is drawn over a second; moves over 20 nm
 * and reduced-motion users jump instead. A followed plane is panned with it.
 *
 * While a plane is followed a pill names it with a Stop button; a drag ends
 * follow mode and the pill offers to resume it for a few seconds.
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
  // Leaflet's own credit is optional; dropping it keeps the phone line short.
  map.attributionControl.setPrefix(false);
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
  /** How each plane moves until its next fix; empty under reduced motion. */
  let motions = new Map<string, Motion>();
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
  /** The plane under the pointer, and the plane the card is showing. */
  let hoveredHex: string | null = null;
  const card = createDetailCard(doc, {
    onClose: () => {
      hoveredHex = null;
      store.select(null);
    },
    onToggle: () => syncCard(store.getState()),
  });
  element.append(card.element);
  // Clicks and scrolls in the card stay in it, not on the map below.
  L.DomEvent.disableClickPropagation(card.element);
  L.DomEvent.disableScrollPropagation(card.element);
  let detailedHex: string | null = null;
  /** The part of the map not under the phone's bottom sheet. */
  let cardArea: CardSize = { width: 0, height: 0 };
  /** A plane the user dragged away from, offered back for a few seconds. */
  let resume: FollowResume | null = null;
  let resumeTimer: ReturnType<typeof setTimeout> | undefined;
  const pill = createFollowPill(doc, (view) => {
    resume = null;
    store.follow(view.action === 'resume' ? view.hex : null);
  });
  element.append(pill.element);
  L.DomEvent.disableClickPropagation(pill.element);
  const syncPill = () =>
    pill.show(followPillView(store.getState(), resume, performance.now()));
  map.on('dragstart', () => {
    endMove?.();
    programmatic = false;
    const { followingHex } = store.getState();
    if (followingHex !== null) {
      resume = { hex: followingHex, until: performance.now() + RESUME_MS };
      clearTimeout(resumeTimer);
      resumeTimer = setTimeout(syncPill, RESUME_MS);
    }
    store.follow(null);
    store.cancelViewRequest();
    syncPill();
  });
  map.on('zoomstart', () => {
    zooming = true;
    if (!programmatic) {
      store.cancelViewRequest();
    }
    syncCard(store.getState());
  });
  /** Marks regional zooms, where the CSS draws smaller silhouettes. */
  const markZoom = () =>
    element.toggleAttribute('data-zoom-low', map.getZoom() <= LOW_ZOOM);
  markZoom();
  map.on('zoomend', () => {
    zooming = false;
    markZoom();
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
   * a zoom is animating, or the card does not fit. The selected plane's card
   * is pinned (it can be closed); on a narrow map it docks at the top. The
   * plane it describes drops its own tag, which the card repeats.
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
    const pinned = hex !== null && hex === state.selectedHex;
    const shown =
      view !== null &&
      card.show(view, cardArea.height - 2 * CARD_MARGIN, {
        pinned,
        docked: pinned && detailCardDocked(cardArea),
      });
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
  /** Ends the guard of the move in flight, if any (see {@link moveMap}). */
  let endMove: (() => void) | null = null;
  /**
   * Runs a map move this controller makes, so it is not taken for the user's.
   * The flag holds until this move ends: Leaflet starts an animated zoom (and
   * fires its zoomstart) a frame later, after `move` has returned. Only one
   * move is tracked; a newer move replaces the older one's handlers, and a
   * moveend fired while `move` runs (the interrupted animation stopping, or
   * a move with nothing to animate) ends the guard only if no animation
   * starts in the next two frames. A user drag clears the flag too.
   */
  const moveMap = (move: () => void) => {
    endMove?.();
    programmatic = true;
    let running = true;
    let endedInside = false;
    let started = false;
    const onStart = () => {
      if (!running) {
        started = true;
      }
    };
    const finish = () => {
      map.off('moveend', onEnd);
      map.off('movestart', onStart);
      if (endMove === finish) {
        endMove = null;
        programmatic = false;
      }
    };
    const onEnd = () => {
      if (running) {
        endedInside = true;
      } else {
        finish();
      }
    };
    endMove = finish;
    map.on('moveend', onEnd);
    map.on('movestart', onStart);
    move();
    running = false;
    if (endedInside) {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (!started) {
            finish();
          }
        }),
      );
    }
  };
  /**
   * Pixels at the bottom of the map hidden by a phone's bottom sheet, when
   * enough map shows above it to fit into; else 0.
   */
  const sheetInset = () =>
    cardArea.height > 160 ? map.getSize().y - cardArea.height : 0;
  /**
   * The centre that puts `position` mid-way down the map left between `top`
   * (pixels covered at the top, such as a docked card) and the sheet.
   */
  const centreAbove = (position: LatLon, zoom: number, top = 0) =>
    map.unproject(
      map
        .project([position.lat, position.lon], zoom)
        .add([0, (sheetInset() - top) / 2]),
      zoom,
    );
  /** Moves the map so highlighted planes and their tags are legible. */
  const fitHighlight = (target: FitTarget, animate: boolean) => {
    if (target.kind === 'point') {
      map.setView(centreAbove(target, target.zoom), target.zoom, { animate });
      return;
    }
    const bounds: [[number, number], [number, number]] = [
      [target.south, target.west],
      [target.north, target.east],
    ];
    // Extra room on the right for the data tags, and under them for a sheet.
    const paddingTopLeft: [number, number] = [48, 48];
    const paddingBottomRight: [number, number] = [140, 48 + sheetInset()];
    const zoom = map.getBoundsZoom(
      bounds,
      false,
      L.point(
        paddingTopLeft[0] + paddingBottomRight[0],
        paddingTopLeft[1] + paddingBottomRight[1],
      ),
    );
    if (zoom < MIN_FIT_ZOOM) {
      const centre = L.latLngBounds(bounds).getCenter();
      map.setView(
        centreAbove({ lat: centre.lat, lon: centre.lng }, MIN_FIT_ZOOM),
        MIN_FIT_ZOOM,
        { animate },
      );
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
    const bottom = sheetInset();
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
   * fit, or a plane picked in the chat, waits until a marker is drawn.
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
    if (request.kind === 'aircraft') {
      const position = drawnAt(request.hex);
      if (position === null) {
        return;
      }
      appliedSeq = request.seq;
      const zoom = Math.max(map.getZoom(), REVEAL_ZOOM);
      moveMap(() =>
        map.setView(centreAbove(position, zoom, card.dockedInset()), zoom, {
          animate,
        }),
      );
      return;
    }
    appliedSeq = request.seq;
    moveMap(() =>
      request.kind === 'area'
        ? fitArea(request.area, animate)
        : map.setView([area.lat, area.lon], area.zoom, { animate }),
    );
  };
  let destroyed = false;
  let settling = false;
  /**
   * Applies a new view request once the chat panel has settled. The request
   * and the sheet snap it causes arrive together, but the framework moves the
   * sheet a frame or two later and then animates its height, so this waits
   * two frames and for that transition before measuring the map left above
   * the sheet. Without a chat panel (tests) it applies at once.
   */
  const applyWhenSettled = (state: AtcState) => {
    const panel = sheet();
    if (panel === null) {
      applyView(state);
      return;
    }
    if (settling) {
      return;
    }
    settling = true;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const running = panel.getAnimations?.() ?? [];
        void Promise.all(
          running.map((animation) => animation.finished.catch(() => null)),
        ).then(() => {
          settling = false;
          if (!destroyed) {
            measureArea();
            applyView(store.getState());
          }
        });
      }),
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
  /** Last drawn pixel of each moving marker, to skip sub-pixel moves. */
  let drawnPixels = new Map<string, string>();
  /** Draws every moving marker at `time`; true while any is still moving. */
  const drawMotions = (time: number): boolean => {
    let moving = false;
    for (const [hex, motion] of motions) {
      const settled = motionSettled(motion, time);
      const { lat, lon } = motionPosition(motion, time);
      const pixel = map.latLngToLayerPoint([lat, lon]).round().toString();
      if (settled || drawnPixels.get(hex) !== pixel) {
        drawnPixels.set(hex, pixel);
        markers.get(hex)?.marker.setLatLng([lat, lon]);
      }
      moving ||= !settled;
    }

    return moving;
  };
  const step = (time: number) => {
    frame = null;
    if (zooming) {
      frame = requestAnimationFrame(step);
      return;
    }
    const moving = drawMotions(time);
    panToFollowed(false);
    syncCard(store.getState());
    if (moving) {
      frame = requestAnimationFrame(step);
    }
  };
  /**
   * Takes a new snapshot's fixes: each plane keeps moving from where it is
   * drawn ({@link nextMotion}); under reduced motion it jumps to its fix.
   */
  const moveMarkers = (state: AtcState) => {
    const now = performance.now();
    if (prefersReducedMotion()) {
      motions = new Map();
      for (const aircraft of state.aircraft.values()) {
        markers
          .get(aircraft.hex)
          ?.marker.setLatLng([aircraft.lat, aircraft.lon]);
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
    syncPill();
    syncOutline(state.shownArea);
    if (state.viewRequest !== null && state.viewRequest.seq !== appliedSeq) {
      applyWhenSettled(state);
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
      destroyed = true;
      resizeObserver?.disconnect();
      unsubscribe();
      doc.removeEventListener('keydown', onKeydown);
      view?.removeEventListener('resize', onResize);
      view?.visualViewport?.removeEventListener('resize', onResize);
      clearInterval(ticker);
      clearTimeout(resumeTimer);
      card.element.remove();
      pill.element.remove();
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
      map.remove();
    },
  };
}
