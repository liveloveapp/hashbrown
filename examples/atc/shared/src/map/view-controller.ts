import type * as Leaflet from 'leaflet';
import type { Map as LeafletMap } from 'leaflet';
import { prefersReducedMotion } from '../dom';
import { AIRPORTS, type Area, type LatLon } from '../places';
import type { AtcState, AtcStore, ShownArea } from '../store';
import type { CardSize } from './detail-card';
import { circleBounds, type FitTarget, fitTarget } from './fit';

/** Furthest out, and furthest in, that fitting highlighted planes will zoom. */
const MIN_FIT_ZOOM = 5;
const MAX_FIT_ZOOM = 10;
/** The least zoom a plane picked in the chat is shown at. */
const REVEAL_ZOOM = 8;
/** Furthest in that showing an area will zoom. */
const MAX_AREA_ZOOM = 12;
/** Space kept around a shown area, in pixels. */
const AREA_PADDING = 24;

/** Applies the store's view requests to the map. */
export interface ViewController {
  /**
   * Applies a new view request once the chat panel has settled. The request
   * and the sheet snap it causes arrive together, but the framework moves the
   * sheet a frame or two later and then animates its height, so this waits
   * two frames and for that transition before measuring the map left above
   * the sheet. Without a chat panel (tests) it applies at once.
   */
  applyWhenSettled(state: AtcState): void;
  /**
   * Shows the area's home view without animating, its centre mid-way down
   * the map left above a phone's sheet. The map calls it once it is mounted.
   */
  showHome(): void;
  /** True while this controller is moving the map. */
  isMoving(): boolean;
  /** A user drag: the move in flight, if any, is no longer ours. */
  cancelMove(): void;
  destroy(): void;
}

/**
 * Creates the controller that moves the map for view requests: fitting
 * highlighted planes, showing an area, revealing one plane or resetting to
 * `area`. Each request applies once (by `seq`), and every move leaves room
 * for a phone's bottom sheet and a docked detail card.
 */
export function createViewController(options: {
  L: typeof Leaflet;
  map: LeafletMap;
  store: AtcStore;
  area: Area;
  /** Where a plane's marker is drawn, or null before it has one. */
  drawnAt: (hex: string) => LatLon | null;
  /** The detail card's view of the map (see `createCardSync`). */
  cards: {
    area(): CardSize;
    dockedInset(): number;
    measureArea(): void;
  };
  obstruction: () => HTMLElement | null;
}): ViewController {
  const { L, map, store, area, drawnAt, cards, obstruction } = options;
  /** The newest view request already applied (or dropped). */
  let appliedSeq: number | null = null;
  /** True while this controller moves the map, so its zooms do not cancel. */
  let programmatic = false;
  /** Ends the guard of the move in flight, if any (see {@link moveMap}). */
  let endMove: (() => void) | null = null;
  let settling = false;
  let destroyed = false;

  /**
   * Runs a map move this controller makes, so it is not taken for the user's.
   * Why: Leaflet reports our own fitBounds and setView as zoomstart and
   * movestart, which would otherwise look like the user taking over and
   * cancel the request.
   *
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
    cards.area().height > 160 ? map.getSize().y - cards.area().height : 0;
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
  /** The home view, centred in the map left above the sheet. */
  const home = (animate: boolean) =>
    map.setView(centreAbove(area.view, area.view.zoom), area.view.zoom, {
      animate,
    });
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
    // Read per move, so turning the OS setting on mid-session stops the
    // next move animating (Leaflet's own zoom animations are set at mount).
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
        map.setView(centreAbove(position, zoom, cards.dockedInset()), zoom, {
          animate,
        }),
      );
      return;
    }
    appliedSeq = request.seq;
    moveMap(() =>
      request.kind === 'area' ? fitArea(request.area, animate) : home(animate),
    );
  };

  return {
    showHome: () => home(false),
    applyWhenSettled(state) {
      if (state.viewRequest === null || state.viewRequest.seq === appliedSeq) {
        return;
      }
      const panel = obstruction();
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
              cards.measureArea();
              applyView(store.getState());
            }
          });
        }),
      );
    },
    isMoving: () => programmatic,
    cancelMove() {
      endMove?.();
      programmatic = false;
    },
    destroy() {
      destroyed = true;
    },
  };
}
