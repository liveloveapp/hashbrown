import { type AircraftDetailView, fitDetailView } from '../detail-view';

/** A point in map container pixels. */
export interface CardPoint {
  readonly x: number;
  readonly y: number;
}

/** A width and height in pixels. */
export interface CardSize {
  readonly width: number;
  readonly height: number;
}

/** The edges of a box in viewport pixels, as `getBoundingClientRect` gives. */
export interface CardRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Space between the plane's centre and the card. */
const OFFSET = 18;
/** Space kept between the card and the map's edges. */
export const CARD_MARGIN = 8;

/**
 * The part of the map the card may use: the whole map, or only the strip
 * above `obstacle` (a bottom sheet) when that overlaps the map's lower part.
 * Something beside the map, such as the desktop chat panel, changes nothing.
 */
export function visibleMapArea(
  map: CardRect,
  obstacle: CardRect | null,
): CardSize {
  const width = map.right - map.left;
  const height = map.bottom - map.top;
  const overlaps =
    obstacle !== null &&
    obstacle.left < map.right &&
    obstacle.right > map.left &&
    obstacle.top < map.bottom &&
    obstacle.bottom > map.top;

  return {
    width,
    height: overlaps
      ? Math.max(0, Math.min(height, obstacle.top - map.top))
      : height,
  };
}

/** True when `point` is within `area`, so the plane is on screen. */
export function isInsideArea(point: CardPoint, area: CardSize): boolean {
  return (
    point.x >= 0 &&
    point.y >= 0 &&
    point.x <= area.width &&
    point.y <= area.height
  );
}

/**
 * Where to put the card's top-left corner for a plane drawn at `point`: to the
 * right of the plane, else to its left, vertically centred on it. When
 * neither side has room (a phone), it goes above the plane, else below it,
 * centred horizontally. Always clamped inside the map with an 8 px margin.
 */
export function detailCardPosition(
  point: CardPoint,
  card: CardSize,
  map: CardSize,
): CardPoint {
  const clamp = (value: number, size: number, limit: number) =>
    Math.round(
      Math.max(CARD_MARGIN, Math.min(value, limit - size - CARD_MARGIN)),
    );
  const right = point.x + OFFSET;
  const left = point.x - OFFSET - card.width;
  const fitsRight = right + card.width <= map.width - CARD_MARGIN;
  const fitsLeft = left >= CARD_MARGIN;
  if (fitsRight || fitsLeft) {
    return {
      x: clamp(fitsRight ? right : left, card.width, map.width),
      y: clamp(point.y - card.height / 2, card.height, map.height),
    };
  }
  const above = point.y - OFFSET - card.height;
  const below = point.y + OFFSET;
  const fitsAt = (y: number) =>
    y >= CARD_MARGIN && y + card.height <= map.height - CARD_MARGIN;
  const vertical = fitsAt(above) ? above : fitsAt(below) ? below : null;
  if (vertical === null) {
    return {
      x: clamp(left, card.width, map.width),
      y: clamp(point.y - card.height / 2, card.height, map.height),
    };
  }

  return {
    x: clamp(point.x - card.width / 2, card.width, map.width),
    y: Math.round(vertical),
  };
}

/** The map's floating detail card: one element, reused for every plane. */
export interface DetailCard {
  readonly element: HTMLElement;
  /**
   * Shows the fullest trim of `view` no taller than `maxHeight`, rebuilding
   * the content only when the view or the room changed. Returns false, and
   * hides the card, when even the smallest trim does not fit.
   */
  show(view: AircraftDetailView, maxHeight: number): boolean;
  /** Hides the card, keeping its element for the next plane. */
  hide(): void;
  /** Places the card beside a plane drawn at `point` inside `area`. */
  place(point: CardPoint, area: CardSize): void;
}

/** Builds an element with a class and, optionally, text (as a text node). */
function el(
  doc: Document,
  tag: string,
  className: string,
  text?: string,
): HTMLElement {
  const node = doc.createElement(tag);
  if (className !== '') {
    node.className = className;
  }
  if (text !== undefined) {
    node.append(doc.createTextNode(text));
  }

  return node;
}

/** The card's content for `view`, built from text nodes only. */
function content(doc: Document, view: AircraftDetailView): HTMLElement[] {
  const header = el(doc, 'div', 'atc-detail-header');
  header.append(el(doc, 'span', 'atc-detail-label', view.label));
  if (view.subtitle !== null) {
    header.append(el(doc, 'span', 'atc-detail-subtitle', view.subtitle));
  }
  const groups = view.groups.map((group) => {
    const section = el(doc, 'div', 'atc-detail-group');
    const list = el(doc, 'dl', 'atc-detail-rows');
    for (const { label, value, wide } of group.rows) {
      const item = el(
        doc,
        'div',
        wide ? 'atc-detail-row is-wide' : 'atc-detail-row',
      );
      item.append(el(doc, 'dt', '', label), el(doc, 'dd', '', value));
      list.append(item);
    }
    section.append(el(doc, 'p', 'atc-detail-title', group.title), list);

    return section;
  });
  const { hiddenRows } = view;
  const note =
    hiddenRows === 0
      ? []
      : [
          el(
            doc,
            'p',
            'atc-detail-note',
            `${hiddenRows} ${hiddenRows === 1 ? 'reading' : 'readings'} hidden to fit`,
          ),
        ];

  return [header, ...groups, ...note];
}

/**
 * Creates the detail card element (`data-testid="aircraft-detail"`), hidden
 * until shown. Content is text nodes only, so no reading can inject markup.
 */
export function createDetailCard(doc: Document): DetailCard {
  const element = el(doc, 'div', 'atc-detail');
  element.setAttribute('data-testid', 'aircraft-detail');
  element.setAttribute('role', 'tooltip');
  element.setAttribute('aria-hidden', 'true');
  let shown = '';
  let fits = false;
  let size: CardSize | null = null;
  let transform = '';
  const render = (view: AircraftDetailView) => {
    element.setAttribute('data-hex', view.hex);
    element.replaceChildren(...content(doc, view));
  };
  const hide = () => {
    if (element.classList.contains('is-open')) {
      element.classList.remove('is-open');
      element.setAttribute('aria-hidden', 'true');
    }
  };

  return {
    element,
    show(view, maxHeight) {
      const key = `${Math.floor(maxHeight)} ${JSON.stringify(view)}`;
      if (key !== shown) {
        shown = key;
        size = null;
        const fitted = fitDetailView(view, maxHeight, (candidate) => {
          render(candidate);
          return element.offsetHeight;
        });
        fits = fitted !== null;
        if (fitted !== null) {
          render(fitted);
        }
      }
      if (!fits) {
        hide();
        return false;
      }
      if (!element.classList.contains('is-open')) {
        element.classList.add('is-open');
        element.setAttribute('aria-hidden', 'false');
      }
      return true;
    },
    hide,
    place(point, area) {
      size ??= { width: element.offsetWidth, height: element.offsetHeight };
      const { x, y } = detailCardPosition(point, size, area);
      const next = `translate(${x}px, ${y}px)`;
      if (next !== transform) {
        transform = next;
        element.style.transform = next;
      }
    },
  };
}
