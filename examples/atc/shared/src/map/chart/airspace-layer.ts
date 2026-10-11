import type * as Leaflet from 'leaflet';
import type { Map as LeafletMap, Marker, Point, Polygon, SVG } from 'leaflet';
import { airspaceOf, type AirspaceShelf } from '../../chart';
import type { LatLon } from '../../places';
import type { AtcState, AtcStore } from '../../store';
import {
  type ShelfLabel,
  shelfLabel,
  shelfLabelAnchor,
} from './airspace-labels';
import type { TagRect } from '../tag-obstacles';
import type { LabelSource } from './chart-labels';
import {
  estimateLabelSize,
  LABEL_PRIORITY,
  type LabelRequest,
} from './label-placer';

/** How far beyond the view (as a fraction of it) shelves are still drawn. */
const NEAR_PAD = 0.5;
/** Labels show from this zoom up. */
const LABEL_ZOOM = 9;
/**
 * Paint order, bottom to top: Class E surface areas, then B and C, then D,
 * so a D ring drawn on the same outline as its E2 area shows blue, as on the
 * chart.
 */
const PAINT_ORDER: Record<string, number> = { B: 1, C: 1, D: 2 };
/**
 * Where a label may sit, best first, as pixel offsets from its anchor
 * point: centred on it, then below, above, right and left.
 */
const LABEL_OFFSETS: readonly (readonly [number, number])[] = [
  [0, 0],
  [0, 16],
  [0, -16],
  [24, 0],
  [-24, 0],
];
/** Label priority: B over C over D. */
const LABEL_ORDER: Record<string, number> = { B: 0, C: 1, D: 2 };
/**
 * The chart's Class D corner brackets, each side broken in the middle. Fixed
 * literals only; the box stretches to its digits.
 */
const BRACKETS =
  '<svg class="atc-as-brackets" viewBox="0 0 20 14" preserveAspectRatio="none" aria-hidden="true">' +
  '<path vector-effect="non-scaling-stroke" d="M0 5V0H6M14 0H20V5M20 9V14H14M6 14H0V9"/>' +
  '</svg>';

/** One shelf, built once per shelves array. */
interface Entry {
  readonly shelf: AirspaceShelf;
  readonly polygon: Polygon;
  /** The cobalt casing under a highlighted shelf, built on first use. */
  casing: Polygon | null;
  readonly label: ShelfLabel | null;
  readonly labelAt: LatLon;
  /** The label marker, built on first use. */
  marker: Marker | null;
  /** The index in {@link LABEL_OFFSETS} the marker's icon is drawn at. */
  offset: number;
}

/** A label that wants placing: its shelf, its text and its candidates. */
interface Pending {
  readonly entry: Entry;
  readonly label: ShelfLabel;
  readonly candidates: readonly TagRect[];
}

/** A mounted airspace layer. */
export interface AirspaceLayer extends LabelSource {
  /**
   * Redraws when the airspace, its layer switch or the highlight changed;
   * true when it did, so the labels need placing again.
   */
  sync(state: AtcState): boolean;
  /** Redraws for the current view; call on `zoomend` and `moveend`. */
  redraw(): void;
  /** Removes every shelf, casing and label. */
  destroy(): void;
}

/** A shelf's rings as Leaflet positions: `[lon, lat]` becomes `[lat, lon]`. */
const latLngs = (shelf: AirspaceShelf): [number, number][][] =>
  shelf.rings.map((ring) =>
    ring.map(([lon, lat]): [number, number] => [lat, lon]),
  );

/** The bbox's area in square degrees, to pick an airport's largest D shelf. */
const bboxArea = ({ bbox: [w, s, e, n] }: AirspaceShelf): number =>
  (e - w) * (n - s);

/** The label's lines, for collision sizing. */
const labelLines = (label: ShelfLabel): string[] =>
  label.kind === 'stack' ? [label.top, label.bottom] : [label.text];

/** The label id of a shelf, unique among every chart layer's labels. */
const labelId = (shelf: AirspaceShelf) => `as:${shelf.id}`;

/**
 * A label's candidate boxes around its anchor `point`, one per
 * {@link LABEL_OFFSETS} entry, each centred as the CSS draws the text.
 */
function labelCandidates(point: Point, label: ShelfLabel): TagRect[] {
  const { width, height } = estimateLabelSize(labelLines(label));

  return LABEL_OFFSETS.map(([dx, dy]) => ({
    left: point.x + dx - width / 2,
    top: point.y + dy - height / 2,
    right: point.x + dx + width / 2,
    bottom: point.y + dy + height / 2,
  }));
}

/**
 * Draws Class B, C, D and E surface-area shelves in `pane`, as unfilled SVG
 * outlines whose colour, width and dashes come from `chart.css` through
 * `atc-as is-<type>` classes. Polygons are built once per
 * `state.airspace.shelves` array and only added or removed after that; the
 * layer syncs only when `airspace`, `layers.airspace` or
 * `highlightedAirspace` change by reference, never on aircraft snapshots.
 * Shelves are culled to the view padded by half, and paint E surface areas
 * first, then B and C, then D on top.
 *
 * A highlighted airport's shelves get `is-highlighted` and a cobalt casing
 * path underneath (`atc-as-casing`); every other shelf, and its label, gets
 * `is-dimmed`.
 * From zoom 9, B and C shelves carry a stacked ceiling-over-floor label and
 * each airport's largest D shelf a bracketed ceiling, near
 * `shelfLabelAnchor` (clear of the airport). The chart's shared label
 * placer (`placeChartLabels`) picks the spot: `labelRequests` offers the
 * anchor and four nudges around it, and `applyLabels` shows the placed
 * labels and removes the rest. Label text goes in through `textContent`;
 * the marker HTML holds only fixed literals.
 */
export function createAirspaceLayer(options: {
  L: typeof Leaflet;
  map: LeafletMap;
  store: AtcStore;
  pane: string;
}): AirspaceLayer {
  const { L, map, store, pane } = options;
  const doc = map.getContainer().ownerDocument;
  let renderer: SVG | null = null;
  let entries: Entry[] = [];
  let source: readonly AirspaceShelf[] | null = null;
  /** The labels the last redraw wants shown, in priority order. */
  let wantedNow: readonly { entry: Entry; label: ShelfLabel }[] = [];
  /** The shelves of the highlighted airport at the last redraw. */
  let litNow: ReadonlySet<AirspaceShelf> = new Set();
  /** The last requests' labels and candidates, by label id. */
  let pending = new Map<string, Pending>();
  let synced: {
    readonly airspace: AtcState['airspace'];
    readonly on: boolean;
    readonly highlighted: string | null;
  } | null = null;

  const removeAll = () => {
    for (const entry of entries) {
      entry.polygon.remove();
      entry.casing?.remove();
      entry.marker?.remove();
    }
    wantedNow = [];
    pending = new Map();
  };

  const build = (shelves: readonly AirspaceShelf[]) => {
    removeAll();
    // The class, not `L.svg()`, which returns null where SVG is not detected.
    renderer ??= new L.SVG({ pane, padding: 0.5 });
    const base = { renderer, pane, fill: false, interactive: false };
    const painted = [...shelves].sort(
      (a, b) => (PAINT_ORDER[a.type] ?? 0) - (PAINT_ORDER[b.type] ?? 0),
    );
    entries = painted.map((shelf) => ({
      shelf,
      polygon: L.polygon(latLngs(shelf), {
        ...base,
        className: `atc-as is-${shelf.type.toLowerCase()}`,
      }),
      casing: null,
      label: shelfLabel(shelf),
      labelAt: shelfLabelAnchor(shelf),
      marker: null,
      offset: 0,
    }));
    source = shelves;
  };

  const casingOf = (entry: Entry): Polygon => {
    entry.casing ??= L.polygon(latLngs(entry.shelf), {
      renderer: renderer ?? undefined,
      pane,
      fill: false,
      interactive: false,
      className: `atc-as-casing is-${entry.shelf.type.toLowerCase()}`,
    });
    return entry.casing;
  };

  /** A label's icon, drawn `LABEL_OFFSETS[offset]` from its anchor. */
  const labelIcon = (entry: Entry, offset: number) => {
    const [dx, dy] = LABEL_OFFSETS[offset] ?? [0, 0];
    return L.divIcon({
      html: '',
      className: `atc-as-label is-${entry.shelf.type.toLowerCase()}`,
      iconSize: [0, 0],
      iconAnchor: [-dx, -dy],
    });
  };

  /**
   * A label's marker, built once and given a new icon only when its offset
   * changes; its text is filled when shown.
   */
  const markerOf = (entry: Entry, offset: number): Marker => {
    if (entry.marker) {
      if (entry.offset !== offset) {
        entry.marker.setIcon(labelIcon(entry, offset));
        entry.offset = offset;
      }
      return entry.marker;
    }
    const marker = L.marker([entry.labelAt.lat, entry.labelAt.lon], {
      icon: labelIcon(entry, offset),
      interactive: false,
      keyboard: false,
      pane,
    });
    entry.marker = marker;
    entry.offset = offset;
    return marker;
  };

  const fillLabel = (element: HTMLElement, label: ShelfLabel) => {
    if (element.firstChild) return;
    const text = doc.createElement('span');
    text.className = `atc-as-text is-${label.kind}`;
    if (label.kind === 'stack') {
      const top = doc.createElement('span');
      top.textContent = label.top;
      const bottom = doc.createElement('span');
      bottom.textContent = label.bottom;
      text.append(top, doc.createElement('hr'), bottom);
    } else {
      text.innerHTML = BRACKETS;
      const digits = doc.createElement('span');
      digits.textContent = label.text;
      text.append(digits);
    }
    element.append(text);
  };

  const labelRequests = (): LabelRequest[] => {
    pending = new Map(
      wantedNow.map(({ entry, label }): [string, Pending] => [
        labelId(entry.shelf),
        {
          entry,
          label,
          candidates: labelCandidates(
            map.latLngToContainerPoint([entry.labelAt.lat, entry.labelAt.lon]),
            label,
          ),
        },
      ]),
    );

    return [...pending].map(([id, { candidates }], index) => ({
      id,
      priority: LABEL_PRIORITY.airspace + index / (pending.size + 1),
      candidates,
    }));
  };

  /**
   * Shows the placed labels at their chosen offsets and removes the rest.
   * While an airport is highlighted, every other shelf's label is dimmed
   * like its outline.
   */
  const applyLabels = (placed: ReadonlyMap<string, number | null>) => {
    const shown = new Set<Entry>();
    for (const [id, { entry, label }] of pending) {
      const offset = placed.get(id);
      if (offset === null || offset === undefined) continue;
      const marker = markerOf(entry, offset);
      if (!map.hasLayer(marker)) marker.addTo(map);
      const element = marker.getElement();
      if (element) {
        fillLabel(element, label);
        element.classList.toggle(
          'is-dimmed',
          litNow.size > 0 && !litNow.has(entry.shelf),
        );
      }
      shown.add(entry);
    }
    for (const entry of entries) {
      if (!shown.has(entry)) entry.marker?.remove();
    }
  };

  /** B and C shelves with labels, and each airport's largest D shelf. */
  const labelled = (drawn: readonly Entry[]) => {
    const largestD = new Map<string, Entry>();
    for (const entry of drawn) {
      if (entry.shelf.type !== 'D' || entry.label === null) continue;
      const best = largestD.get(entry.shelf.airport);
      if (!best || bboxArea(entry.shelf) > bboxArea(best.shelf)) {
        largestD.set(entry.shelf.airport, entry);
      }
    }
    const kept = new Set(largestD.values());
    return drawn
      .flatMap((entry) =>
        entry.label !== null &&
        (entry.shelf.type === 'B' ||
          entry.shelf.type === 'C' ||
          kept.has(entry))
          ? [{ entry, label: entry.label }]
          : [],
      )
      .sort(
        (a, b) =>
          (LABEL_ORDER[a.entry.shelf.type] ?? 9) -
            (LABEL_ORDER[b.entry.shelf.type] ?? 9) ||
          bboxArea(b.entry.shelf) - bboxArea(a.entry.shelf),
      );
  };

  const redraw = () => {
    const state = store.getState();
    if (state.airspace.shelves !== source) build(state.airspace.shelves);
    if (!state.layers.airspace || state.airspace.status !== 'ready') {
      removeAll();
      return;
    }
    const near = map.getBounds().pad(NEAR_PAD);
    const code = state.highlightedAirspace;
    const lit = new Set(
      code === null ? [] : airspaceOf(state.airspace.shelves, code),
    );
    const drawn: Entry[] = [];
    let added = false;
    for (const entry of entries) {
      const [w, s, e, n] = entry.shelf.bbox;
      const visible = near.intersects([
        [s, w],
        [n, e],
      ]);
      if (!visible) {
        entry.polygon.remove();
        entry.casing?.remove();
        continue;
      }
      drawn.push(entry);
      const highlighted = lit.has(entry.shelf);
      if (highlighted) {
        const casing = casingOf(entry);
        if (!map.hasLayer(casing)) {
          casing.addTo(map);
          added = true;
        }
      } else {
        entry.casing?.remove();
      }
      if (!map.hasLayer(entry.polygon)) {
        entry.polygon.addTo(map);
        added = true;
      }
      // Leaflet rebuilds a path on every add, so the state classes are set
      // on each redraw rather than once.
      const path = entry.polygon.getElement();
      path?.classList.toggle('is-highlighted', highlighted);
      path?.classList.toggle('is-dimmed', lit.size > 0 && !highlighted);
    }
    // Leaflet appends a path when it is added, so after any add the shelves
    // are raised in paint order: every shelf above every casing, D above E.
    if (added) {
      for (const entry of drawn) entry.polygon.bringToFront();
    }
    wantedNow = map.getZoom() >= LABEL_ZOOM ? labelled(drawn) : [];
    litNow = lit;
  };

  return {
    sync(state) {
      if (
        synced !== null &&
        synced.airspace === state.airspace &&
        synced.on === state.layers.airspace &&
        synced.highlighted === state.highlightedAirspace
      ) {
        return false;
      }
      synced = {
        airspace: state.airspace,
        on: state.layers.airspace,
        highlighted: state.highlightedAirspace,
      };
      redraw();
      return true;
    },
    redraw,
    labelRequests,
    applyLabels,
    destroy() {
      removeAll();
      renderer?.remove();
      renderer = null;
      entries = [];
      source = null;
      synced = null;
    },
  };
}
