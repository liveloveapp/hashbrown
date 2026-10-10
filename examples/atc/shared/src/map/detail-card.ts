import type { AircraftDetailView } from '../views';

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

/** Space between the plane's centre and the card. */
const OFFSET = 18;
/** Space kept between the card and the map's edges. */
const MARGIN = 8;

/**
 * Where to put the card's top-left corner for a plane drawn at `point`: to the
 * right of the plane, or to its left when that would overflow, vertically
 * centred on it, and always clamped inside the map with an 8 px margin.
 */
export function detailCardPosition(
  point: CardPoint,
  card: CardSize,
  map: CardSize,
): CardPoint {
  const right = point.x + OFFSET;
  const x =
    right + card.width <= map.width - MARGIN
      ? right
      : point.x - OFFSET - card.width;
  const clamp = (value: number, size: number, limit: number) =>
    Math.round(Math.max(MARGIN, Math.min(value, limit - size - MARGIN)));

  return {
    x: clamp(x, card.width, map.width),
    y: clamp(point.y - card.height / 2, card.height, map.height),
  };
}

/** The map's floating detail card: one element, reused for every plane. */
export interface DetailCard {
  readonly element: HTMLElement;
  /** Shows `view`, rebuilding the content only when it changed. */
  show(view: AircraftDetailView): void;
  /** Hides the card, keeping its element for the next plane. */
  hide(): void;
  /** Places the card beside a plane drawn at `point` inside a map of `map`. */
  place(point: CardPoint, map: CardSize): void;
}

/** Builds an element with a class and, optionally, text (as a text node). */
function el(
  doc: Document,
  tag: string,
  className: string,
  text?: string,
): HTMLElement {
  const node = doc.createElement(tag);
  node.className = className;
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
    for (const { label, value } of group.rows) {
      const item = el(doc, 'div', 'atc-detail-row');
      item.append(el(doc, 'dt', '', label), el(doc, 'dd', '', value));
      list.append(item);
    }
    section.append(el(doc, 'p', 'atc-detail-title', group.title), list);

    return section;
  });

  return [header, ...groups];
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
  let size: CardSize | null = null;
  let transform = '';

  return {
    element,
    show(view) {
      const key = JSON.stringify(view);
      if (key !== shown) {
        shown = key;
        size = null;
        element.setAttribute('data-hex', view.hex);
        element.replaceChildren(...content(doc, view));
      }
      if (!element.classList.contains('is-open')) {
        element.classList.add('is-open');
        element.setAttribute('aria-hidden', 'false');
      }
    },
    hide() {
      if (element.classList.contains('is-open')) {
        element.classList.remove('is-open');
        element.setAttribute('aria-hidden', 'true');
      }
    },
    place(point, map) {
      size ??= { width: element.offsetWidth, height: element.offsetHeight };
      const { x, y } = detailCardPosition(point, size, map);
      const next = `translate(${x}px, ${y}px)`;
      if (next !== transform) {
        transform = next;
        element.style.transform = next;
      }
    },
  };
}
