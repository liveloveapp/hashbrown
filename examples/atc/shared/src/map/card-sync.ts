import type * as Leaflet from 'leaflet';
import type { Map as LeafletMap, Marker } from 'leaflet';
import { aircraftDetailView } from '../detail-view';
import { hoverless } from '../dom';
import type { LatLon } from '../places';
import type { AtcState, AtcStore } from '../store';
import {
  CARD_MARGIN,
  type CardSize,
  createDetailCard,
  detailCardDocked,
  isInsideArea,
  visibleMapArea,
} from './detail-card';
import { exactContainerPoint, type PixelPoint } from './pixels';
import { planeElementOf } from './plane-marker';

/**
 * The least map, in pixels, that must show above a phone's sheet for moves
 * to fit into it; with less, the sheet is ignored.
 */
const SHEET_MIN_MAP = 160;

/**
 * The strip of map left visible, in container pixels: below a docked card,
 * above a phone's sheet.
 */
export interface MapBand {
  readonly top: number;
  readonly bottom: number;
}

/** Keeps the map's one detail card on the hovered or selected plane. */
export interface CardSync {
  /**
   * Shows the card beside the hovered plane, else the selected one, and
   * hides it when there is none, the plane is off screen or under the sheet,
   * a zoom is animating, or the card does not fit. Pass `force` to rebuild
   * the readings even though the state has not changed.
   */
  sync(state: AtcState, force?: boolean): void;
  /** Re-measures the area the card may use; on resize, never per frame. */
  measureArea(): void;
  /**
   * Pixels the card will cover at the top of the map once it shows the
   * selected plane docked, else 0. When the card is not docked yet (the
   * plane is off screen), a hidden copy is measured for that plane, so a
   * reveal can leave room for it before the plane comes on screen. A
   * hovered plane does not change it: the selected plane is the one the
   * card shows once the pointer leaves, and reveals come from the chat.
   */
  dockedInsetFor(state: AtcState): number;
  /**
   * The strip of map left visible: below a docked card and above a phone's
   * sheet (when enough map shows above it to use).
   */
  visibleBand(): MapBand;
  /** The hovered plane, and the plane the card describes now. */
  focus(): { hovered: string | null; detailed: string | null };
  /** The pointer entered a plane. */
  hover(hex: string): void;
  /** The pointer left a plane. */
  leave(hex: string): void;
  /** A plane left the map. */
  forget(hex: string): void;
  destroy(): void;
}

/**
 * Creates the detail card in `element` and keeps it in sync. The selected
 * plane's card is pinned (it can be closed); on a narrow map it docks at the
 * top. The plane it describes drops its own tag, which the card repeats.
 */
export function createCardSync(options: {
  L: typeof Leaflet;
  map: LeafletMap;
  element: HTMLElement;
  store: AtcStore;
  markers: ReadonlyMap<string, Marker>;
  isZooming: () => boolean;
  /** Where a plane is drawn now, if it is. */
  drawnAt: (hex: string) => LatLon | null;
  /** What covers the map's lower part on phones (the chat sheet), if anything. */
  obstruction: () => HTMLElement | null;
}): CardSync {
  const { L, map, element, store, markers, isZooming, drawnAt, obstruction } =
    options;
  let hoveredHex: string | null = null;
  /** The plane the card is showing. */
  let detailedHex: string | null = null;
  /** The map the card may use: above a phone's sheet. */
  let visibleArea: CardSize = { width: 0, height: 0 };
  /** The inputs of the card on screen, so animation frames skip rebuilding it. */
  let shownKey: string | null = null;
  const card = createDetailCard(element.ownerDocument, {
    onClose: () => {
      hoveredHex = null;
      store.select(null);
    },
    onToggle: () => sync(store.getState(), true),
  });
  element.append(card.element);
  // Clicks and scrolls in the card stay in it, not on the map below.
  L.DomEvent.disableClickPropagation(card.element);
  L.DomEvent.disableScrollPropagation(card.element);
  let lastState: AtcState | null = null;

  const hide = () => {
    shownKey = null;
    card.hide();
  };
  /**
   * Where the card's plane is drawn, or null when there is no plane, it is
   * not drawn yet, a zoom is animating, or it is outside the visible area.
   */
  const cardPointOf = (hex: string | null): PixelPoint | null => {
    const position = hex === null ? null : drawnAt(hex);
    if (position === null || isZooming()) {
      return null;
    }
    const point = exactContainerPoint(map, position);

    return isInsideArea(point, visibleArea) ? point : null;
  };
  /** Moves `is-detailed` to the plane the card describes now, if any. */
  const markDetailed = (next: string | null) => {
    if (next === detailedHex) {
      return;
    }
    if (detailedHex !== null) {
      planeElementOf(markers, detailedHex)?.classList.remove('is-detailed');
    }
    if (next !== null) {
      planeElementOf(markers, next)?.classList.add('is-detailed');
    }
    detailedHex = next;
  };
  const sync = (state: AtcState, force = false) => {
    const hex = hoveredHex ?? state.selectedHex;
    const point = cardPointOf(hex);
    const pinned = hex !== null && hex === state.selectedHex;
    const docked = pinned && detailCardDocked(visibleArea);
    const maxHeight = visibleArea.height - 2 * CARD_MARGIN;
    // The view only changes with the state; the message age is redrawn by
    // the ticker below, so a moving plane only moves its card.
    const inputs = `${hex} ${pinned} ${docked} ${Math.floor(maxHeight)}`;
    const reuse = !force && state === lastState && inputs === shownKey;
    lastState = state;
    if (hex === null || point === null) {
      markDetailed(null);
      hide();
      return;
    }
    if (!reuse) {
      const view = aircraftDetailView(state, hex, Date.now());
      if (view === null || !card.show(view, maxHeight, { pinned, docked })) {
        markDetailed(null);
        hide();
        return;
      }
    }
    markDetailed(hex);
    shownKey = inputs;
    card.place(point, visibleArea);
  };
  // Counts the card's message age up between snapshots.
  const ticker = setInterval(() => {
    if (detailedHex !== null) {
      sync(store.getState(), true);
    }
  }, 1000);

  return {
    sync,
    measureArea() {
      const size = map.getSize();
      const box = element.getBoundingClientRect();
      const panel = obstruction()?.getBoundingClientRect();
      visibleArea = visibleMapArea(
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
    },
    dockedInsetFor(state) {
      const shown = card.dockedInset();
      const hex = state.selectedHex;
      if (shown > 0 || hex === null || !detailCardDocked(visibleArea)) {
        return shown;
      }
      const view = aircraftDetailView(state, hex, Date.now());

      return view === null
        ? 0
        : card.measureDocked(view, visibleArea.height - 2 * CARD_MARGIN);
    },
    visibleBand: () => ({
      top: card.dockedInset(),
      bottom:
        visibleArea.height > SHEET_MIN_MAP
          ? visibleArea.height
          : map.getSize().y,
    }),
    focus: () => ({ hovered: hoveredHex, detailed: detailedHex }),
    hover(hex) {
      // A tap's mouseover would stick on a touch screen; taps select instead.
      if (hoverless()) {
        return;
      }
      hoveredHex = hex;
      sync(store.getState());
    },
    leave(hex) {
      hoveredHex = hoveredHex === hex ? null : hoveredHex;
      sync(store.getState());
    },
    forget(hex) {
      hoveredHex = hoveredHex === hex ? null : hoveredHex;
    },
    destroy() {
      clearInterval(ticker);
      card.remove();
    },
  };
}
