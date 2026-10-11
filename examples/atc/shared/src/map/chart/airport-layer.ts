import type * as Leaflet from 'leaflet';
import type { Map as LeafletMap, Marker } from 'leaflet';
import type { ChartAirport, Surfaces } from '../../chart';
import { type Airport, FALLBACK_AIRPORTS } from '../../places';
import type { AtcState, AtcStore } from '../../store';
import { airportSymbol } from './airport-symbol';
import { dataBlockLines, renderDataBlock } from './data-block';
import { blockZoomRule, placeBlocks, visibleAirports } from './declutter';
import { DIAGRAM_ZOOM, drawsLargeOutline } from './diagram-layer';
/** How far beyond the view (as a fraction of it) airports are still drawn. */
const NEAR_PAD = 0.5;

type Tone = 'towered' | 'nontowered' | 'fallback';

/** One airport to draw at the current zoom. */
interface Drawn {
  readonly airport: ChartAirport | Airport;
  readonly tone: Tone;
  readonly symbol: boolean;
  /** The data block's lines, or null when the zoom allows no block. */
  readonly lines: readonly string[] | null;
}

/** A data block marker and what its element currently shows. */
interface Block {
  readonly marker: Marker;
  key: string;
  filled: HTMLElement | null;
}

/** A mounted airport layer. */
export interface AirportLayer {
  /** Redraws when the chart, the layers or the surfaces changed. */
  sync(state: AtcState): void;
  /** Redraws for the current view; call on `zoomend` and `moveend`. */
  redraw(): void;
  /** Removes every marker. */
  destroy(): void;
}

/**
 * Whether an airport's symbol shows at `zoom`. At zoom 11 a large airport's
 * runway outlines replace it (`drawsLargeOutline`). From zoom 12 a loaded
 * diagram (a `Surfaces` object) replaces it; while surfaces load or after
 * they fail, the symbol stays.
 */
function drawsSymbol(
  airport: ChartAirport,
  zoom: number,
  surfaces: AtcState['surfaces'],
): boolean {
  if (zoom >= DIAGRAM_ZOOM) {
    return !isLoaded(surfaces.get(airport.code));
  }
  return !drawsLargeOutline(airport, zoom);
}

function isLoaded(value: Surfaces | 'loading' | 'failed' | undefined) {
  return typeof value === 'object';
}

/** The airports to draw: the FAA chart when ready, otherwise the fallback table. */
function drawnAirports(state: AtcState, zoom: number): Drawn[] {
  if (state.chart.status !== 'ready') {
    return FALLBACK_AIRPORTS.map((airport) => ({
      airport,
      tone: 'fallback',
      symbol: true,
      lines: [airport.code],
    }));
  }
  return visibleAirports(state.chart.airports, zoom).map((airport) => ({
    airport,
    tone: airport.towered ? 'towered' : 'nontowered',
    symbol: drawsSymbol(airport, zoom, state.surfaces),
    lines: blockZoomRule(airport, zoom) ? dataBlockLines(airport, zoom) : null,
  }));
}

/**
 * Draws the sectional airport symbols and their data blocks in `pane`. One
 * marker per airport is created once per airports array and then only added
 * or removed; aircraft snapshots never reach it, because `sync` acts only
 * when `state.chart`, `state.layers` or `state.surfaces` changed. Until the
 * FAA chart is ready the fallback table draws as ink rings labelled with
 * their ICAO codes. Data blocks are placed in rank order around the symbols
 * by `placeBlocks`, and their text goes in through `renderDataBlock`.
 */
export function createAirportLayer(options: {
  L: typeof Leaflet;
  map: LeafletMap;
  store: AtcStore;
  pane: string;
}): AirportLayer {
  const { L, map, store, pane } = options;
  const doc = map.getContainer().ownerDocument;
  const symbols = new Map<string, Marker>();
  const blocks = new Map<string, Block>();
  let source: readonly (ChartAirport | Airport)[] | null = null;
  let synced: Pick<AtcState, 'chart' | 'layers' | 'surfaces'> | null = null;

  const clear = () => {
    for (const marker of symbols.values()) marker.remove();
    for (const { marker } of blocks.values()) marker.remove();
    symbols.clear();
    blocks.clear();
  };

  const symbolMarker = (airport: ChartAirport | Airport): Marker => {
    const existing = symbols.get(airport.code);
    if (existing) return existing;
    const { className, html, size } = airportSymbol(airport);
    const marker = L.marker([airport.lat, airport.lon], {
      icon: L.divIcon({
        html,
        className,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      }),
      interactive: false,
      keyboard: false,
      pane,
    });
    symbols.set(airport.code, marker);
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
    anchor: [number, number],
  ) => {
    const key = `${tone}\n${anchor.join(',')}\n${lines.join('\n')}`;
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
      element.replaceChildren(renderDataBlock(doc, lines, tone));
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
      drawn.filter((d) => d.symbol).map((d) => d.airport.code),
    );
    for (const [code, marker] of symbols) {
      if (!wanted.has(code)) marker.remove();
    }
    for (const { airport, symbol } of drawn) {
      const marker = symbol ? symbolMarker(airport) : null;
      if (marker && !map.hasLayer(marker)) marker.addTo(map);
    }

    const labelled = drawn.flatMap((d) =>
      d.lines === null ? [] : [{ ...d, lines: d.lines }],
    );
    const points = new Map(
      labelled.map(({ airport }) => [
        airport.code,
        map.latLngToContainerPoint([airport.lat, airport.lon]),
      ]),
    );
    const placed = placeBlocks(
      labelled.map(({ airport, lines }) => {
        const point = points.get(airport.code) ?? { x: 0, y: 0 };
        return { code: airport.code, x: point.x, y: point.y, lines };
      }),
    );
    for (const [code, { marker }] of blocks) {
      if (!placed.has(code)) marker.remove();
    }
    for (const { airport, lines, tone } of labelled) {
      const at = placed.get(airport.code);
      const point = points.get(airport.code);
      if (at && point) {
        showBlock(airport, lines, tone, [point.x - at.x, point.y - at.y]);
      }
    }
  };

  return {
    sync(state) {
      if (
        synced !== null &&
        synced.chart === state.chart &&
        synced.layers === state.layers &&
        synced.surfaces === state.surfaces
      ) {
        return;
      }
      synced = {
        chart: state.chart,
        layers: state.layers,
        surfaces: state.surfaces,
      };
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
