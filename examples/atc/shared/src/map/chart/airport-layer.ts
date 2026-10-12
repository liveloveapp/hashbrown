import type * as Leaflet from 'leaflet';
import type { Map as LeafletMap, Marker, Point } from 'leaflet';
import type { ChartAirport } from '../../chart';
import { type Airport, FALLBACK_AIRPORTS } from '../../places';
import type { AtcState, AtcStore } from '../../store';
import { type PixelRect, rectAround, rectAt } from '../pixels';
import { airportRing, RING_BOX } from './airport-ring';
import type { LabelSource } from './chart-labels';
import { dataBlockLines, renderDataBlock } from './data-block';
import { visibleAirports } from './declutter';
import {
  estimateLabelSize,
  LABEL_PRIORITY,
  type LabelRequest,
} from './label-placer';

/** How far beyond the view (as a fraction of it) airports are still drawn. */
const NEAR_PAD = 0.5;
/** Space between an airport's box and its label, in pixels. */
const LABEL_GAP = 4;

type Tone = 'ink' | 'fallback';

/** One airport to draw at the current zoom. */
interface Drawn {
  readonly airport: ChartAirport | Airport;
  readonly tone: Tone;
  /** Whether the lines are the bare ident (zoom 9 and below, or fallback). */
  readonly ident: boolean;
  /** Whether the airport draws an ink ring (its runways cannot be drawn). */
  readonly ring: boolean;
  /** The data block's lines. */
  readonly lines: readonly string[];
}

/** A data block marker and what its element currently shows. */
interface Block {
  readonly marker: Marker;
  key: string;
  filled: HTMLElement | null;
}

/** A label request's airport, where it is drawn and its candidates. */
interface Pending {
  readonly drawn: Drawn;
  readonly point: Point;
  readonly candidates: readonly PixelRect[];
}

/** A mounted airport layer. */
export interface AirportLayer extends LabelSource {
  /**
   * Redraws when the chart or the layers changed; true when it did, so the
   * labels need placing again.
   */
  sync(state: AtcState): boolean;
  /** Redraws for the current view; call on `zoomend` and `moveend`. */
  redraw(): void;
  /**
   * Every drawn airport's box in container pixels (see `anchorBox`): its
   * runway extent, or the ring box when it has a ring, and at least the
   * 12x12 box around its reference point. Fallback airports included; no
   * label may cover any of them.
   */
  airportBoxes(): readonly PixelRect[];
  /** Removes every marker. */
  destroy(): void;
}

/**
 * Where an airport's label may go around its `box`, best first: right of it
 * (vertically centred), left, above and below (centred), each
 * {@link LABEL_GAP} pixels clear. A block is `width` by `height` pixels.
 */
export function labelCandidates(
  box: PixelRect,
  width: number,
  height: number,
): PixelRect[] {
  const midX = (box.left + box.right) / 2 - width / 2;
  const midY = (box.top + box.bottom) / 2 - height / 2;

  return [
    rectAt(box.right + LABEL_GAP, midY, width, height),
    rectAt(box.left - LABEL_GAP - width, midY, width, height),
    rectAt(midX, box.top - LABEL_GAP - height, width, height),
    rectAt(midX, box.bottom + LABEL_GAP, width, height),
  ];
}

/** The label id of an airport, unique among every chart layer's labels. */
const labelId = (code: string) => `apt:${code}`;

/**
 * Whether a chart airport draws a ring instead of runways: heliports and
 * seaplane bases always do, and so does an airport with no runway that has
 * surveyed corners. Every other airport's runways are its symbol.
 */
function drawsRing(airport: ChartAirport): boolean {
  if (airport.kind === 'heliport' || airport.kind === 'seaplane') return true;
  return airport.runways.every((runway) => runway.corners === null);
}

/**
 * An airport's box in container pixels: the bounding box of every drawn
 * runway's corners and ends at the current zoom, grown to cover at least the
 * {@link RING_BOX} square around the reference point; just that square for
 * an airport drawn as a ring.
 */
function anchorBox(
  drawn: Drawn,
  project: (lat: number, lon: number) => Point,
): PixelRect {
  const { airport } = drawn;
  const point = project(airport.lat, airport.lon);
  const reference = rectAround(point.x, point.y, RING_BOX);
  if (drawn.ring || !('runways' in airport)) return reference;
  const points = airport.runways
    .filter((runway) => runway.corners !== null)
    .flatMap((runway) => [...(runway.corners ?? []), ...(runway.ends ?? [])])
    .map(({ lat, lon }) => project(lat, lon));

  return {
    left: Math.min(reference.left, ...points.map((p) => p.x)),
    top: Math.min(reference.top, ...points.map((p) => p.y)),
    right: Math.max(reference.right, ...points.map((p) => p.x)),
    bottom: Math.max(reference.bottom, ...points.map((p) => p.y)),
  };
}

/** A drawn airport's label priority, ordered by rank within its tier. */
function priorityOf(drawn: Drawn, index: number, count: number): number {
  const tier =
    drawn.tone === 'fallback'
      ? LABEL_PRIORITY.fallback
      : 'towered' in drawn.airport && drawn.airport.towered
        ? LABEL_PRIORITY.towered
        : LABEL_PRIORITY.airport;

  return tier + index / (count + 1);
}

/** The airports to draw: the FAA chart when ready, otherwise the fallback table. */
function drawnAirports(state: AtcState, zoom: number): Drawn[] {
  if (state.chart.status !== 'ready') {
    return FALLBACK_AIRPORTS.map((airport) => ({
      airport,
      tone: 'fallback',
      ident: true,
      ring: true,
      lines: [airport.code],
    }));
  }
  return visibleAirports(state.chart.airports, zoom).map((airport) => ({
    airport,
    tone: 'ink',
    ident: zoom <= 9,
    ring: drawsRing(airport),
    lines: dataBlockLines(airport, zoom),
  }));
}

/**
 * Draws the ink airport rings and the data blocks in `pane`. Runways are
 * drawn by the diagram layer; a ring marks only an airport whose runways
 * cannot be drawn (see `airportRing`), and every fallback-table airport
 * until the FAA chart is ready. One ring marker per airport is created once
 * per airports array and then only added or removed; aircraft snapshots
 * never reach it, because `sync` acts only when `state.chart` or
 * `state.layers` changed. Data blocks are placed by the chart's shared
 * label placer (`placeChartLabels`): `labelRequests` offers each block
 * beside its runways (see {@link labelCandidates}), towered fields first,
 * and `applyLabels` shows the placed ones. Text goes in through
 * `renderDataBlock`, never as HTML.
 */
export function createAirportLayer(options: {
  L: typeof Leaflet;
  map: LeafletMap;
  store: AtcStore;
  pane: string;
}): AirportLayer {
  const { L, map, store, pane } = options;
  const doc = map.getContainer().ownerDocument;
  const rings = new Map<string, Marker>();
  const blocks = new Map<string, Block>();
  /** The airports drawn by the last redraw, in rank order. */
  let drawnNow: readonly Drawn[] = [];
  /** The last requests' airports and candidates, by label id. */
  let pending = new Map<string, Pending>();
  /** The anchor boxes of every drawn airport, from the last label requests. */
  let boxes: readonly PixelRect[] | null = null;
  let source: readonly (ChartAirport | Airport)[] | null = null;
  let synced: Pick<AtcState, 'chart' | 'layers'> | null = null;

  const clear = () => {
    for (const marker of rings.values()) marker.remove();
    for (const { marker } of blocks.values()) marker.remove();
    rings.clear();
    blocks.clear();
    drawnNow = [];
    pending = new Map();
    boxes = null;
  };

  const project = (lat: number, lon: number) =>
    map.latLngToContainerPoint([lat, lon]);

  const ringMarker = (airport: ChartAirport | Airport): Marker => {
    const existing = rings.get(airport.code);
    if (existing) return existing;
    const { className, html } = airportRing(airport);
    const marker = L.marker([airport.lat, airport.lon], {
      icon: L.divIcon({
        html,
        className,
        iconSize: [RING_BOX, RING_BOX],
        iconAnchor: [RING_BOX / 2, RING_BOX / 2],
      }),
      interactive: false,
      keyboard: false,
      pane,
    });
    rings.set(airport.code, marker);
    return marker;
  };

  /** A block's icon: empty HTML, filled afterwards; the block sizes itself. */
  const blockIcon = (anchor: [number, number]) =>
    L.divIcon({
      html: '',
      className: 'atc-apt-block-icon',
      iconSize: [0, 0],
      iconAnchor: anchor,
    });

  const showBlock = (
    airport: ChartAirport | Airport,
    lines: readonly string[],
    tone: Tone,
    ident: boolean,
    anchor: [number, number],
  ) => {
    const key = `${tone}\n${ident}\n${anchor.join(',')}\n${lines.join('\n')}`;
    let block = blocks.get(airport.code);
    if (!block) {
      block = {
        marker: L.marker([airport.lat, airport.lon], {
          icon: blockIcon(anchor),
          interactive: false,
          keyboard: false,
          pane,
        }),
        key,
        filled: null,
      };
      blocks.set(airport.code, block);
    } else if (block.key !== key) {
      block.marker.setIcon(blockIcon(anchor));
      block.key = key;
      block.filled = null;
    }
    if (!map.hasLayer(block.marker)) block.marker.addTo(map);
    const element = block.marker.getElement();
    if (element && element !== block.filled) {
      element.replaceChildren(renderDataBlock(doc, lines, tone, ident));
      block.filled = element;
    }
  };

  const redraw = () => {
    const state = store.getState();
    const current =
      state.chart.status === 'ready' ? state.chart.airports : FALLBACK_AIRPORTS;
    if (current !== source) {
      clear();
      source = current;
    }
    if (!state.layers.airports) {
      clear();
      return;
    }
    const zoom = map.getZoom();
    const near = map.getBounds().pad(NEAR_PAD);
    const drawn = drawnAirports(state, zoom).filter(({ airport }) =>
      near.contains([airport.lat, airport.lon]),
    );

    const wanted = new Set(
      drawn.filter((d) => d.ring).map((d) => d.airport.code),
    );
    for (const [code, marker] of rings) {
      if (!wanted.has(code)) marker.remove();
    }
    for (const { airport, ring } of drawn) {
      const marker = ring ? ringMarker(airport) : null;
      if (marker && !map.hasLayer(marker)) marker.addTo(map);
    }

    drawnNow = drawn;
    boxes = null;
  };

  const labelRequests = (): LabelRequest[] => {
    // Every drawn airport is an obstacle; only those in view get labels.
    const view = map.getBounds();
    const anchors = drawnNow.map((drawn) => ({
      drawn,
      box: anchorBox(drawn, project),
    }));
    boxes = anchors.map(({ box }) => box);
    pending = new Map(
      anchors
        .filter(({ drawn }) =>
          view.contains([drawn.airport.lat, drawn.airport.lon]),
        )
        .map(({ drawn, box }): [string, Pending] => {
          const { width, height } = estimateLabelSize(drawn.lines);
          return [
            labelId(drawn.airport.code),
            {
              drawn,
              point: project(drawn.airport.lat, drawn.airport.lon),
              candidates: labelCandidates(box, width, height),
            },
          ];
        }),
    );

    return [...pending].map(([id, { drawn, candidates }], index) => ({
      id,
      priority: priorityOf(drawn, index, pending.size),
      candidates,
    }));
  };

  const applyLabels = (placed: ReadonlyMap<string, number | null>) => {
    const shown = new Set<string>();
    for (const [id, { drawn, point, candidates }] of pending) {
      const index = placed.get(id);
      const at =
        index === null || index === undefined ? null : candidates[index];
      if (!at) continue;
      const { airport, lines, tone, ident } = drawn;
      showBlock(airport, lines, tone, ident, [
        point.x - at.left,
        point.y - at.top,
      ]);
      shown.add(airport.code);
    }
    for (const [code, { marker }] of blocks) {
      if (!shown.has(code)) marker.remove();
    }
  };

  const airportBoxes = (): readonly PixelRect[] =>
    boxes ?? drawnNow.map((drawn) => anchorBox(drawn, project));

  return {
    sync(state) {
      if (
        synced !== null &&
        synced.chart === state.chart &&
        synced.layers === state.layers
      ) {
        return false;
      }
      synced = { chart: state.chart, layers: state.layers };
      redraw();
      return true;
    },
    redraw,
    labelRequests,
    applyLabels,
    airportBoxes,
    destroy() {
      clear();
      source = null;
      synced = null;
    },
  };
}
