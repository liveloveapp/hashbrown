// @vitest-environment jsdom
import * as module from 'leaflet';
import { expect, onTestFinished, test } from 'vitest';
import type { AirspaceShelf, ChartAirport } from '../../chart';
import { createAtcStore } from '../../store';
import { intersects, type TagRect } from '../tag-obstacles';
import { createAirportLayer } from './airport-layer';
import { shelfLabelAnchor } from './airspace-labels';
import { createAirspaceLayer } from './airspace-layer';
import { placeChartLabels } from './chart-labels';

const L = (module as unknown as { default?: typeof module }).default ?? module;

const half = 0.06;
const lon = -121.15;
const lat = 44.2541;
const dShelf: AirspaceShelf = {
  id: 'KRDM-D-0',
  airport: 'KRDM',
  name: 'REDMOND',
  class: 'D',
  type: 'D',
  floor: { ft: 0, ref: 'SFC' },
  ceiling: { ft: 5600, exclusive: false },
  partTime: false,
  rings: [
    [
      [lon - half, lat - half],
      [lon + half, lat - half],
      [lon + half, lat + half],
      [lon - half, lat + half],
      [lon - half, lat - half],
    ],
  ],
  bbox: [lon - half, lat - half, lon + half, lat + half],
};
const labelAt = shelfLabelAnchor(dShelf);
/** A ring-only field right on the D box's label point. */
const field: ChartAirport = {
  code: 'S33',
  faa: 'S33',
  name: 'NEAR FIELD',
  city: 'REDMOND',
  state: 'OR',
  aliases: [],
  lat: labelAt.lat,
  lon: labelAt.lon,
  elevationFt: 3000,
  kind: 'airport',
  towered: false,
  towerPartTime: false,
  frequencies: { tower: null, atis: null, ctaf: '122.8', unicom: null },
  weather: null,
  lighting: 'none',
  fuel: false,
  military: false,
  runways: [],
  rank: 0,
};

/** A 400x300 map on the D label point with both chart layers placing together. */
function mount(zoom: number) {
  const store = createAtcStore();
  const element = document.createElement('div');
  element.className = 'atc-map';
  document.body.append(element);
  Object.defineProperty(element, 'clientWidth', { value: 400 });
  Object.defineProperty(element, 'clientHeight', { value: 300 });
  const map = L.map(element, {
    zoomAnimation: false,
    fadeAnimation: false,
    markerZoomAnimation: false,
  }).setView([labelAt.lat, labelAt.lon], zoom);
  map.createPane('atc-airspace');
  map.createPane('atc-airports');
  const airspace = createAirspaceLayer({ L, map, store, pane: 'atc-airspace' });
  const airports = createAirportLayer({ L, map, store, pane: 'atc-airports' });
  const sync = () => {
    const state = store.getState();
    const changed = [airspace.sync(state), airports.sync(state)];
    if (changed.some(Boolean)) {
      placeChartLabels({
        zoom: map.getZoom(),
        sources: [airspace, airports],
        runwayBoxes: airports.runwayBoxes,
      });
    }
  };
  const unsubscribe = store.subscribe(sync);
  sync();
  onTestFinished(() => {
    unsubscribe();
    airspace.destroy();
    airports.destroy();
    map.remove();
    element.remove();
  });

  return { store, map, element, airspace, airports };
}

/** The candidate whose top-left (or centre) sits at `x`, `y`. */
const candidateAt = (
  candidates: readonly TagRect[],
  x: number,
  y: number,
  centred: boolean,
): TagRect | undefined =>
  candidates.find((c) => {
    const left = centred ? (c.left + c.right) / 2 : c.left;
    const top = centred ? (c.top + c.bottom) / 2 : c.top;
    return Math.abs(left - x) < 1 && Math.abs(top - y) < 1;
  });

/** Where a marker's icon is drawn: its point plus the icon's margins. */
const drawnAt = (
  map: ReturnType<typeof mount>['map'],
  icon: HTMLElement,
  at: { lat: number; lon: number },
) => {
  const point = map.latLngToContainerPoint([at.lat, at.lon]);
  return {
    x: point.x + parseFloat(icon.style.marginLeft || '0'),
    y: point.y + parseFloat(icon.style.marginTop || '0'),
  };
};

test('an airport on a D box label point and the D box both show, apart', () => {
  const view = mount(11);

  view.store.setChart({
    cycle: '2610',
    effective: '2026-09-03',
    airports: [field],
  });
  view.store.setAirspace({
    cycle: '2610',
    effective: '2026-10-08',
    shelves: [dShelf],
  });

  const label = view.element.querySelector<HTMLElement>('.atc-as-label');
  const block =
    view.element.querySelector<HTMLElement>('.atc-apt-block')?.parentElement;
  expect(label).not.toBeNull();
  expect(block).toBeDefined();
  const labelPoint = drawnAt(view.map, label as HTMLElement, labelAt);
  const blockPoint = drawnAt(view.map, block as HTMLElement, field);
  const labelBox = candidateAt(
    view.airspace.labelRequests()[0]?.candidates ?? [],
    labelPoint.x,
    labelPoint.y,
    true,
  );
  const blockBox = candidateAt(
    view.airports.labelRequests()[0]?.candidates ?? [],
    blockPoint.x,
    blockPoint.y,
    false,
  );
  expect(labelBox).toBeDefined();
  expect(blockBox).toBeDefined();
  expect(labelBox && blockBox && intersects(labelBox, blockBox)).toBe(false);
});
