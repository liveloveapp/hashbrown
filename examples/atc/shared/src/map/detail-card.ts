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

/**
 * How the card is shown: `pinned` for the selected plane (it gets a close
 * button), `docked` on narrow maps (it sits at the top, full width, with only
 * its summary until the user asks for more).
 */
export interface DetailCardMode {
  readonly pinned: boolean;
  readonly docked: boolean;
}

const HOVER: DetailCardMode = { pinned: false, docked: false };

/** Whether a map this wide gets the docked card. */
export function detailCardDocked(area: CardSize): boolean {
  return area.width < 560;
}

/** What the card calls back for. */
export interface DetailCardOptions {
  /** The close button was pressed (the card is pinned). */
  readonly onClose?: () => void;
  /** More or fewer readings were asked for; the card needs showing again. */
  readonly onToggle?: () => void;
}

/** The map's floating detail card: one element, reused for every plane. */
export interface DetailCard {
  readonly element: HTMLElement;
  /**
   * Shows the fullest trim of `view` no taller than `maxHeight`, rebuilding
   * the readings only when the view (apart from the message age, updated in
   * place), the room or the mode changed. The header and buttons are never
   * rebuilt. Returns
   * false, and hides the card, when even the smallest trim does not fit. A
   * docked card with every reading open scrolls instead of trimming.
   */
  show(
    view: AircraftDetailView,
    maxHeight: number,
    mode?: DetailCardMode,
  ): boolean;
  /** Hides the card, keeping its element for the next plane. */
  hide(): void;
  /** Places the card beside a plane drawn at `point` inside `area`, or docks it. */
  place(point: CardPoint, area: CardSize): void;
  /**
   * The pixels the card covers at the top of the map while it is open and
   * docked (with its margins), else 0.
   */
  dockedInset(): number;
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

/** A small X drawn with two strokes, for the close button. */
function closeIcon(doc: Document): SVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('aria-hidden', 'true');
  const path = doc.createElementNS(ns, 'path');
  path.setAttribute('d', 'M4 4l8 8M12 4l-8 8');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.6');
  path.setAttribute('stroke-linecap', 'round');
  svg.append(path);

  return svg;
}

/** A definition list of rows, each `dt` above its `dd`. */
function rows(
  doc: Document,
  className: string,
  itemClass: string,
  items: AircraftDetailView['summary']['figures'],
): HTMLElement {
  const list = el(doc, 'dl', className);
  for (const { id, label, value, wide, text } of items) {
    const item = el(doc, 'div', wide ? `${itemClass} is-wide` : itemClass);
    if (id !== undefined) {
      item.setAttribute('data-row', id);
    }
    item.append(
      el(doc, 'dt', '', label),
      el(doc, 'dd', text ? 'is-text' : '', value),
    );
    list.append(item);
  }

  return list;
}

/** The view without its message age, which is updated in place instead. */
function withoutAge(view: AircraftDetailView): AircraftDetailView {
  return {
    ...view,
    groups: view.groups.map((group) => ({
      ...group,
      rows: group.rows.map((row) =>
        row.id === 'age' ? { ...row, value: '' } : row,
      ),
    })),
  };
}

/** The message age in a view, or null. */
function ageOf(view: AircraftDetailView): string | null {
  for (const group of view.groups) {
    const row = group.rows.find((r) => r.id === 'age');
    if (row) {
      return row.value;
    }
  }

  return null;
}

/** Sets an element's text only when it changed. */
function setText(node: Element, text: string): void {
  if (node.textContent !== text) {
    node.textContent = text;
  }
}

/**
 * The card's parts. The header, the close button and the More button are
 * built once and only updated, so keyboard focus and a tap in progress
 * survive every snapshot and every tick of the message age.
 */
interface CardParts {
  readonly label: HTMLElement;
  readonly subtitle: HTMLElement;
  readonly close: HTMLElement;
  readonly summary: HTMLElement;
  readonly more: HTMLElement;
  readonly body: HTMLElement;
}

function buildParts(doc: Document, element: HTMLElement): CardParts {
  const header = el(doc, 'div', 'atc-detail-header');
  const label = el(doc, 'span', 'atc-detail-label');
  const subtitle = el(doc, 'span', 'atc-detail-subtitle');
  const close = el(doc, 'button', 'atc-detail-close');
  close.setAttribute('type', 'button');
  close.append(closeIcon(doc));
  header.append(label, subtitle, close);
  const summary = el(doc, 'div', 'atc-detail-summary');
  const more = el(doc, 'button', 'atc-detail-more');
  more.setAttribute('type', 'button');
  const body = el(doc, 'div', 'atc-detail-body');
  element.append(header, summary, more, body);

  return { label, subtitle, close, summary, more, body };
}

/**
 * Fills the card's parts for `view`, from text nodes only: the header (with
 * a close button when pinned), the summary, then the reading groups, which a
 * docked card keeps behind the More button until `more`. The summary and the
 * groups are rebuilt; the header and buttons are updated in place.
 */
function fill(
  doc: Document,
  parts: CardParts,
  view: AircraftDetailView,
  mode: DetailCardMode,
  more: boolean,
): void {
  setText(parts.label, view.label);
  setText(parts.subtitle, view.subtitle ?? '');
  parts.subtitle.hidden = view.subtitle === null;
  parts.close.hidden = !mode.pinned;
  parts.close.setAttribute('aria-label', `Close details for ${view.label}`);
  const { type, route, figures } = view.summary;
  const line = [type, route].filter((part) => part !== null).join(' · ');
  parts.summary.replaceChildren(
    ...(line === '' ? [] : [el(doc, 'p', 'atc-detail-line', line)]),
    ...(figures.length === 0
      ? []
      : [rows(doc, 'atc-detail-figures', 'atc-detail-figure', figures)]),
  );
  parts.more.hidden = !(mode.docked && view.groups.length > 0);
  setText(parts.more, more ? 'Fewer readings' : 'More readings');
  parts.more.setAttribute('aria-expanded', String(more));
  if (mode.docked && !more) {
    parts.body.replaceChildren();
    return;
  }
  const groups = view.groups.map((group) => {
    const section = el(doc, 'div', 'atc-detail-group');
    section.append(
      el(doc, 'p', 'atc-detail-title', group.title),
      rows(doc, 'atc-detail-rows', 'atc-detail-row', group.rows),
    );

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
  parts.body.replaceChildren(...groups, ...note);
}

/** Writes the message age into the drawn readings, in place. */
function fillAge(parts: CardParts, age: string | null): void {
  const value = parts.body.querySelector('[data-row="age"] dd');
  if (value && age !== null) {
    setText(value, age);
  }
}
/**
 * Creates the detail card element (`data-testid="aircraft-detail"`), hidden
 * until shown. Content is text nodes only, so no reading can inject markup.
 */
export function createDetailCard(
  doc: Document,
  options: DetailCardOptions = {},
): DetailCard {
  const element = el(doc, 'div', 'atc-detail');
  element.setAttribute('data-testid', 'aircraft-detail');
  element.setAttribute('aria-hidden', 'true');
  let shown = '';
  let fits = false;
  let size: CardSize | null = null;
  let transform = '';
  let mode = HOVER;
  let more = false;
  let hex: string | null = null;
  const parts = buildParts(doc, element);
  element.addEventListener('click', (event) => {
    // Handled here: the map below must not take it for a click on empty map.
    event.stopPropagation();
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('.atc-detail-close')) {
      options.onClose?.();
    } else if (target?.closest('.atc-detail-more')) {
      more = !more;
      options.onToggle?.();
    }
  });
  const render = (view: AircraftDetailView) => {
    element.setAttribute('data-hex', view.hex);
    fill(doc, parts, view, mode, more);
  };
  const hide = () => {
    if (element.classList.contains('is-open')) {
      element.classList.remove('is-open');
      element.setAttribute('aria-hidden', 'true');
    }
  };

  return {
    element,
    show(view, maxHeight, next = HOVER) {
      if (view.hex !== hex) {
        hex = view.hex;
        more = false;
      }
      mode = next;
      // A hovered card is a tooltip; a pinned one is a small dialog-like panel.
      element.setAttribute('role', mode.pinned ? 'group' : 'tooltip');
      element.setAttribute('aria-label', `Details for ${view.label}`);
      element.classList.toggle('is-pinned', mode.pinned);
      element.classList.toggle('is-docked', mode.docked);
      element.classList.toggle('is-more', mode.docked && more);
      const scrolls = mode.docked && more;
      // Rebuild only when something but the message age changed; the age
      // ticks every second and is written in place, so focus on Close or
      // More survives.
      const key = `${Math.floor(maxHeight)} ${mode.pinned} ${mode.docked} ${more} ${JSON.stringify(withoutAge(view))}`;
      if (key !== shown) {
        shown = key;
        size = null;
        element.style.maxHeight = scrolls ? `${Math.floor(maxHeight)}px` : '';
        if (scrolls) {
          render(view);
          fits = true;
        } else {
          const fitted = fitDetailView(view, maxHeight, (candidate) => {
            render(candidate);
            return element.offsetHeight;
          });
          fits = fitted !== null;
          if (fitted !== null) {
            render(fitted);
          }
        }
      }
      if (!fits) {
        hide();
        return false;
      }
      fillAge(parts, ageOf(view));
      if (!element.classList.contains('is-open')) {
        element.classList.add('is-open');
        element.setAttribute('aria-hidden', 'false');
      }
      return true;
    },
    hide,
    dockedInset() {
      const height = element.offsetHeight;

      return mode.docked && element.classList.contains('is-open') && height > 0
        ? height + 2 * CARD_MARGIN
        : 0;
    },
    place(point, area) {
      size ??= { width: element.offsetWidth, height: element.offsetHeight };
      const { x, y } = mode.docked
        ? { x: CARD_MARGIN, y: CARD_MARGIN }
        : detailCardPosition(point, size, area);
      const next = `translate(${x}px, ${y}px)`;
      if (next !== transform) {
        transform = next;
        element.style.transform = next;
      }
    },
  };
}
