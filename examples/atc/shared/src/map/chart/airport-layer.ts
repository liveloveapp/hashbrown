import type * as Leaflet from 'leaflet';
import type { Map as LeafletMap, Marker } from 'leaflet';
import type { ChartAirport } from '../../chart';
import { type Airport, FALLBACK_AIRPORTS } from '../../places';
import type { AtcState, AtcStore } from '../../store';
import { airportRing, RING_BOX } from './airport-ring';
import { dataBlockLines, renderDataBlock } from './data-block';
import { placeBlocks, visibleAirports } from './declutter';
/** How far beyond the view (as a fraction of it) airports are still drawn. */
const NEAR_PAD = 0.5;

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

/** A mounted airport layer. */
export interface AirportLayer {
  /** Redraws when the chart or the layers changed. */
  sync(state: AtcState): void;
  /** Redraws for the current view; call on `zoomend` and `moveend`. */
  redraw(): void;
  /** Removes every marker. */
  destroy(): void;
}

/**
 * Whether a chart airport draws a ring instead of runways: heliports and
 * seaplane bases always do, and so does an airport with no runway that has
 * surveyed corners. Every other airport's runways are its symbol.
 */
function drawsRing(airport: ChartAirport): boolean {
  if (airport.kind === 'heliport' || airport.kind === 'seaplane') return true;
  return airport.runways.every((runway) => runway.corners === null);
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
 * `state.layers` changed. Data blocks are placed in rank order around the
 * airports by `placeBlocks`, and their text goes in through `renderDataBlock`.
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
  let source: readonly (ChartAirport | Airport)[] | null = null;
  let synced: Pick<AtcState, 'chart' | 'layers'> | null = null;

  const clear = () => {
    for (const marker of rings.values()) marker.remove();
    for (const { marker } of blocks.values()) marker.remove();
    rings.clear();
    blocks.clear();
  };

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

    const points = new Map(
      drawn.map(({ airport }) => [
        airport.code,
        map.latLngToContainerPoint([airport.lat, airport.lon]),
      ]),
    );
    const placed = placeBlocks(
      drawn.map(({ airport, lines }) => {
        const point = points.get(airport.code) ?? { x: 0, y: 0 };
        return { code: airport.code, x: point.x, y: point.y, lines };
      }),
    );
    for (const [code, { marker }] of blocks) {
      if (!placed.has(code)) marker.remove();
    }
    for (const { airport, lines, tone, ident } of drawn) {
      const at = placed.get(airport.code);
      const point = points.get(airport.code);
      if (at && point) {
        showBlock(airport, lines, tone, ident, [
          point.x - at.x,
          point.y - at.y,
        ]);
      }
    }
  };

  return {
    sync(state) {
      if (
        synced !== null &&
        synced.chart === state.chart &&
        synced.layers === state.layers
      ) {
        return;
      }
      synced = { chart: state.chart, layers: state.layers };
      redraw();
    },
    redraw,
    destroy() {
      clear();
      source = null;
      synced = null;
    },
  };
}
