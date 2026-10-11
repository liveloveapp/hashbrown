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
import { exactLayerPoint } from './motion-loop';

/**
 * The least map, in pixels, that must show above a phone's sheet for moves
 * to fit into it; with less, the sheet is ignored.
 */
export const SHEET_MIN_MAP = 160;

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
   * The strip of map left visible, in container pixels: below a docked card
   * and above a phone's sheet (when enough map shows above it to use).
   */
  band(): { top: number; bottom: number };
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
  let cardArea: CardSize = { width: 0, height: 0 };
  /** The inputs of the card on screen, so animation frames skip rebuilding it. */
  let drawn: string | null = null;
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

  const planeElement = (hex: string | null) =>
    hex === null
      ? null
      : markers.get(hex)?.getElement()?.querySelector('.atc-plane');
  const hide = () => {
    drawn = null;
    card.hide();
  };
  const sync = (state: AtcState, force = false) => {
    const hex = hoveredHex ?? state.selectedHex;
    const position = hex === null ? null : drawnAt(hex);
    const point =
      position && !isZooming()
        ? map.layerPointToContainerPoint(exactLayerPoint(map, position))
        : null;
    const pinned = hex !== null && hex === state.selectedHex;
    const docked = pinned && detailCardDocked(cardArea);
    const maxHeight = cardArea.height - 2 * CARD_MARGIN;
    // The view only changes with the state; the message age is redrawn by
    // the ticker below, so a moving plane only moves its card.
    const inputs = `${hex} ${pinned} ${docked} ${Math.floor(maxHeight)}`;
    const reuse = !force && state === lastState && inputs === drawn;
    lastState = state;
    const inside =
      hex !== null && point !== null && isInsideArea(point, cardArea);
    const view =
      inside && !reuse ? aircraftDetailView(state, hex, Date.now()) : null;
    const shown =
      inside &&
      (reuse ||
        (view !== null && card.show(view, maxHeight, { pinned, docked })));
    const next = shown ? hex : null;
    if (next !== detailedHex) {
      planeElement(detailedHex)?.classList.remove('is-detailed');
      planeElement(next)?.classList.add('is-detailed');
      detailedHex = next;
    }
    if (!shown || point === null) {
      hide();
      return;
    }
    drawn = inputs;
    card.place(point, cardArea);
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
    },
    dockedInsetFor(state) {
      const shown = card.dockedInset();
      const hex = state.selectedHex;
      if (shown > 0 || hex === null || !detailCardDocked(cardArea)) {
        return shown;
      }
      const view = aircraftDetailView(state, hex, Date.now());

      return view === null
        ? 0
        : card.measureDocked(view, cardArea.height - 2 * CARD_MARGIN);
    },
    band: () => ({
      top: card.dockedInset(),
      bottom:
        cardArea.height > SHEET_MIN_MAP ? cardArea.height : map.getSize().y,
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
      card.element.remove();
    },
  };
}
