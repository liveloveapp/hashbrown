import type * as Leaflet from 'leaflet';
import type { Map as LeafletMap } from 'leaflet';
import { prefersReducedMotion } from '../dom';
import { airspaceOf } from '../chart';
import { airportByCode, chartAirportByCode } from '../directory';
import type { Area, LatLon } from '../places';
import type { AtcState, AtcStore, ShownArea } from '../store';
import type { MapBand } from './card-sync';
import { DIAGRAM_ZOOM } from './chart/diagram-layer';
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
/** Space kept around fitted planes, in pixels. */
const FIT_PADDING = 48;
/** Extra room on the right of fitted planes for their data tags, in pixels. */
const TAG_ROOM = 140;
/**
 * Showing an airport zooms to at least this: a step past where its diagram
 * starts drawing, so the diagram is legible.
 */
const MIN_AIRPORT_ZOOM = DIAGRAM_ZOOM + 1;
/** Furthest in that showing an airport will zoom. */
const MAX_AIRPORT_ZOOM = 15;
/** Half the box around an airport without runway corners, in degrees. */
const AIRPORT_BOX_DEG = 0.02;

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
 * highlighted planes, showing an area or an airport, revealing one plane or
 * resetting to `area`. Each request applies once (by `seq`), and every move
 * leaves room for a phone's bottom sheet and a docked detail card.
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
    visibleBand(): MapBand;
    dockedInsetFor(state: AtcState): number;
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
    let inMoveCall = true;
    let endedDuringCall = false;
    let animationStarted = false;
    const onMoveStart = () => {
      if (!inMoveCall) {
        animationStarted = true;
      }
    };
    const endGuard = () => {
      map.off('moveend', onMoveEnd);
      map.off('movestart', onMoveStart);
      if (endMove === endGuard) {
        endMove = null;
        programmatic = false;
      }
    };
    const onMoveEnd = () => {
      if (inMoveCall) {
        endedDuringCall = true;
      } else {
        endGuard();
      }
    };
    endMove = endGuard;
    map.on('moveend', onMoveEnd);
    map.on('movestart', onMoveStart);
    move();
    inMoveCall = false;
    if (endedDuringCall) {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (!animationStarted) {
            endGuard();
          }
        }),
      );
    }
  };
  /**
   * Pixels at the bottom of the map hidden by a phone's bottom sheet, when
   * enough map shows above it to fit into; else 0.
   */
  const sheetInset = () => map.getSize().y - cards.visibleBand().bottom;
  /** Pixels a docked detail card covers at the top of the map, else 0. */
  const cardInset = () => cards.visibleBand().top;
  /**
   * The centre that puts `position` mid-way down the map left between `top`
   * (pixels covered at the top: by default the docked card) and the sheet.
   */
  const centreAbove = (position: LatLon, zoom: number, top = cardInset()) =>
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
    // Extra room on the right for the data tags, under them for a sheet and
    // above them for a docked card.
    const paddingTopLeft: [number, number] = [
      FIT_PADDING,
      FIT_PADDING + cardInset(),
    ];
    const paddingBottomRight: [number, number] = [
      TAG_ROOM,
      FIT_PADDING + sheetInset(),
    ];
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
  /**
   * The move that fits a circle around an airport, keeping it below a docked
   * card and above a phone's sheet. Null when the airport is unknown.
   */
  const areaMove = (
    state: AtcState,
    shown: ShownArea,
    animate: boolean,
  ): (() => void) | null => {
    const centre = airportByCode(state, shown.airport);
    if (centre === null) {
      return null;
    }
    const box = circleBounds(centre, shown.radiusNm);

    return () =>
      map.fitBounds(
        [
          [box.south, box.west],
          [box.north, box.east],
        ],
        {
          paddingTopLeft: [AREA_PADDING, AREA_PADDING + cardInset()],
          paddingBottomRight: [AREA_PADDING, AREA_PADDING + sheetInset()],
          maxZoom: MAX_AREA_ZOOM,
          animate,
        },
      );
  };
  /**
   * The move that shows one airport's diagram: fits its runway corners (or a
   * small box around it) at zoom 13 to 15, between a docked card and a
   * phone's sheet. Null when the airport is unknown.
   */
  const airportMove = (
    state: AtcState,
    code: string,
    animate: boolean,
  ): (() => void) | null => {
    const airport = airportByCode(state, code);
    if (airport === null) {
      return null;
    }
    const corners =
      chartAirportByCode(state, code)?.runways.flatMap(
        (runway) => runway.corners ?? [],
      ) ?? [];
    const bounds =
      corners.length > 0
        ? L.latLngBounds(corners.map(({ lat, lon }) => [lat, lon]))
        : L.latLngBounds(
            [airport.lat - AIRPORT_BOX_DEG, airport.lon - AIRPORT_BOX_DEG],
            [airport.lat + AIRPORT_BOX_DEG, airport.lon + AIRPORT_BOX_DEG],
          );
    const zoom = Math.min(
      MAX_AIRPORT_ZOOM,
      Math.max(
        MIN_AIRPORT_ZOOM,
        map.getBoundsZoom(
          bounds,
          false,
          L.point(
            2 * AREA_PADDING,
            2 * AREA_PADDING + sheetInset() + cardInset(),
          ),
        ),
      ),
    );
    const centre = bounds.getCenter();

    return () =>
      map.setView(
        centreAbove({ lat: centre.lat, lon: centre.lng }, zoom),
        zoom,
        { animate },
      );
  };
  /**
   * The move that fits the union of the bboxes of one airport's airspace
   * shelves, between a docked card and a phone's sheet. Null without
   * shelves: the map stays where it is.
   */
  const airspaceMove = (
    state: AtcState,
    code: string,
    animate: boolean,
  ): (() => void) | null => {
    const shelves = airspaceOf(state.airspace.shelves, code);
    if (shelves.length === 0) {
      return null;
    }
    const bounds = L.latLngBounds(
      shelves.flatMap(({ bbox: [west, south, east, north] }) => [
        [south, west] as [number, number],
        [north, east] as [number, number],
      ]),
    );

    return () =>
      map.fitBounds(bounds, {
        paddingTopLeft: [AREA_PADDING, AREA_PADDING + cardInset()],
        paddingBottomRight: [AREA_PADDING, AREA_PADDING + sheetInset()],
        maxZoom: MAX_AREA_ZOOM,
        animate,
      });
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
    let move: (() => void) | null;
    // Only `highlight` and `aircraft` return before `appliedSeq` is set:
    // they wait for a marker, and the next render tries again.
    switch (request.kind) {
      case 'highlight': {
        const positions = new Map<string, LatLon>();
        for (const hex of state.highlighted) {
          const position = drawnAt(hex);
          if (position) {
            positions.set(hex, position);
          }
        }
        const target = fitTarget(state.highlighted, positions);
        if (target === null) {
          return;
        }
        move = () => fitHighlight(target, animate);
        break;
      }
      case 'aircraft': {
        const position = drawnAt(request.hex);
        if (position === null) {
          return;
        }
        const zoom = Math.max(map.getZoom(), REVEAL_ZOOM);
        // The card docks once the plane is on screen; leave room for it now.
        const top = cards.dockedInsetFor(state);
        move = () =>
          map.setView(centreAbove(position, zoom, top), zoom, { animate });
        break;
      }
      case 'area':
        move = areaMove(state, request.area, animate);
        break;
      case 'airport':
        move = airportMove(state, request.airport, animate);
        break;
      case 'airspace':
        move = airspaceMove(state, request.airport, animate);
        break;
      case 'reset':
        move = () => home(animate);
        break;
      default: {
        const unknown: never = request;
        throw new Error(`Unknown view request: ${JSON.stringify(unknown)}`);
      }
    }
    appliedSeq = request.seq;
    // Nothing to move (an unknown airport, no shelves): entering moveMap
    // would hold the guard with no moveend to end it.
    if (move !== null) {
      moveMap(move);
    }
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
            running.map((animation) =>
              // A cancelled transition rejects `finished`; it has still stopped moving.
              animation.finished.catch(() => null),
            ),
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
