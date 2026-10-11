// @vitest-environment jsdom
import * as module from 'leaflet';
import { expect, onTestFinished, test, vi } from 'vitest';
import type { Aircraft } from '../../aircraft';
import type { AirspaceShelf } from '../../chart';
import { createAtcStore } from '../../store';
import { createAirspaceLayer } from './airspace-layer';

const L = (module as unknown as { default?: typeof module }).default ?? module;

type Ring = (readonly [number, number])[];

/** A closed square ring around (lon, lat), `half` degrees each way. */
const square = (lon: number, lat: number, half: number): Ring => [
  [lon - half, lat - half],
  [lon + half, lat - half],
  [lon + half, lat + half],
  [lon - half, lat + half],
  [lon - half, lat - half],
];

/** A shelf centred on Redmond, `half` degrees each way. */
const shelf = (
  id: string,
  over: Partial<AirspaceShelf> & Pick<AirspaceShelf, 'type' | 'class'>,
  half = 0.05,
  lon = -121.15,
  lat = 44.2541,
): AirspaceShelf => ({
  id,
  airport: id.split('-')[0] ?? id,
  name: id,
  floor: { ft: 0, ref: 'SFC' },
  ceiling: { ft: 5600, exclusive: true },
  partTime: false,
  rings: [square(lon, lat, half)],
  bbox: [lon - half, lat - half, lon + half, lat + half],
  ...over,
});

const shelves: AirspaceShelf[] = [
  shelf('KRDM-D-0', { class: 'D', type: 'D' }, 0.06),
  shelf('KRDM-D-1', { class: 'D', type: 'D' }, 0.02),
  shelf('KRDM-E2-0', { class: 'E', type: 'E2' }, 0.08),
  shelf(
    'KXXC-C-0',
    {
      class: 'C',
      type: 'C',
      floor: { ft: 1100, ref: 'MSL' },
      ceiling: { ft: 4000, exclusive: false },
    },
    0.04,
    -121.0,
    44.2,
  ),
  shelf(
    'KXXB-B-0',
    {
      class: 'B',
      type: 'B',
      ceiling: { ft: 10000, exclusive: false },
    },
    0.04,
    -121.3,
    44.3,
  ),
  shelf('KFAR-D-0', { class: 'D', type: 'D' }, 0.05, -100, 30),
];

const plane: Aircraft = {
  hex: 'aaaaaa',
  label: 'N352LL',
  callsign: null,
  registration: 'N352LL',
  typeCode: 'C172',
  category: null,
  kind: 'single',
  lat: 44.1,
  lon: -121.2,
  altitudeFt: 5000,
  onGround: false,
  groundSpeedKt: 110,
  trackDeg: 90,
  verticalRateFpm: 0,
};

/** A 400x300 map over Redmond with the airspace layer synced to a store. */
function mount(zoom = 10) {
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
  }).setView([44.2541, -121.15], zoom);
  map.createPane('atc-airspace');
  const layer = createAirspaceLayer({ L, map, store, pane: 'atc-airspace' });
  const unsubscribe = store.subscribe(() => layer.sync(store.getState()));
  layer.sync(store.getState());
  map.on('zoomend moveend', () => layer.redraw());
  onTestFinished(() => {
    unsubscribe();
    layer.destroy();
    map.remove();
    element.remove();
  });
  const all = (selector: string) => [...element.querySelectorAll(selector)];

  return { store, map, layer, element, all };
}

const load = (store: ReturnType<typeof createAtcStore>) =>
  store.setAirspace({ cycle: '2610', effective: '2026-10-08', shelves });

test('each shelf is an SVG path classed by its type', () => {
  const view = mount();

  load(view.store);

  expect(view.all('path.atc-as.is-d')).toHaveLength(2);
  expect(view.all('path.atc-as.is-e2')).toHaveLength(1);
  expect(view.all('path.atc-as.is-c')).toHaveLength(1);
  expect(view.all('path.atc-as.is-b')).toHaveLength(1);
  const pane = view.map.getPane('atc-airspace');
  expect(pane?.querySelectorAll('path.atc-as')).toHaveLength(5);
});

test('shelves far outside the view are culled', () => {
  const view = mount();

  load(view.store);

  expect(view.all('path.atc-as')).toHaveLength(5);
  view.map.setView([30, -100], 10);
  expect(view.all('path.atc-as')).toHaveLength(1);
});

test('nothing draws before the airspace loads', () => {
  const view = mount();

  view.store.setAirspaceFailed();

  expect(view.all('.atc-as')).toHaveLength(0);
  expect(view.all('.atc-as-label')).toHaveLength(0);
});

test('zoom 8 has no labels', () => {
  const view = mount(8);

  load(view.store);

  expect(view.all('path.atc-as').length).toBeGreaterThan(0);
  expect(view.all('.atc-as-label')).toHaveLength(0);
});

test('zoom 10 labels B and C with stacks and one D box per airport', () => {
  const view = mount(10);

  load(view.store);

  const stacks = view.all('.atc-as-label.is-c, .atc-as-label.is-b');
  expect(stacks).toHaveLength(2);
  const c = view.all('.atc-as-label.is-c')[0];
  const figures = [...(c?.querySelectorAll('.atc-as-text > span') ?? [])];
  expect(figures.map((span) => span.textContent)).toEqual(['40', '11']);
  expect(c?.querySelector('hr')).not.toBeNull();
  const boxes = view.all('.atc-as-label.is-d');
  expect(boxes).toHaveLength(1);
  expect(boxes[0]?.textContent).toBe('56');
  expect(boxes[0]?.querySelector('svg')).not.toBeNull();
  expect(view.all('.atc-as-label.is-e2')).toHaveLength(0);
});

test('zooming out from 10 to 8 removes the labels', () => {
  const view = mount(10);
  load(view.store);

  view.map.setZoom(8);

  expect(view.all('.atc-as-label')).toHaveLength(0);
});

test('showing KRDM highlights its shelves, casings them and dims the rest', () => {
  const view = mount();
  load(view.store);

  view.store.showAirspace('KRDM');

  const rdm = view.all('path.atc-as.is-highlighted');
  expect(rdm).toHaveLength(3);
  expect(view.all('path.atc-as.is-dimmed')).toHaveLength(2);
  expect(view.all('path.atc-as-casing')).toHaveLength(3);
  expect(view.all('path.atc-as-casing.is-d')).toHaveLength(2);
  expect(view.all('path.atc-as.is-highlighted.is-dimmed')).toHaveLength(0);
  // Each casing sits underneath: every casing comes before every shelf it cases.
  const paths = view.all('path');
  const lastCasing = Math.max(
    ...view.all('path.atc-as-casing').map((p) => paths.indexOf(p)),
  );
  const firstHighlighted = Math.min(...rdm.map((p) => paths.indexOf(p)));
  expect(lastCasing).toBeLessThan(firstHighlighted);
});

test('clearing the highlight removes casings and dimming', () => {
  const view = mount();
  load(view.store);
  view.store.showAirspace('KRDM');

  view.store.clearHighlight();

  expect(view.all('path.atc-as-casing')).toHaveLength(0);
  expect(view.all('path.atc-as.is-dimmed')).toHaveLength(0);
  expect(view.all('path.atc-as.is-highlighted')).toHaveLength(0);
});

test('an aircraft snapshot never rebuilds polygons', () => {
  const view = mount();
  load(view.store);
  const polygon = vi.spyOn(L, 'polygon');
  const marker = vi.spyOn(L, 'marker');
  onTestFinished(() => {
    polygon.mockRestore();
    marker.mockRestore();
  });
  const before = view.all('path.atc-as');

  view.store.applySnapshot({ at: 1, aircraft: [plane] });
  view.store.applySnapshot({ at: 2, aircraft: [plane] });

  expect(polygon).not.toHaveBeenCalled();
  expect(marker).not.toHaveBeenCalled();
  expect(view.all('path.atc-as')).toEqual(before);
});

test('polygons are built once per shelves array', () => {
  const view = mount();
  load(view.store);
  const polygon = vi.spyOn(L, 'polygon');
  onTestFinished(() => polygon.mockRestore());

  view.store.setLayers({ airspace: false });
  view.store.setLayers({ airspace: true });
  view.map.setZoom(11);

  expect(polygon).not.toHaveBeenCalled();
  expect(view.all('path.atc-as').length).toBeGreaterThan(0);
});

test('turning the airspace layer off removes every shelf and label', () => {
  const view = mount();
  load(view.store);

  view.store.setLayers({ airspace: false });

  expect(view.all('.atc-as')).toHaveLength(0);
  expect(view.all('.atc-as-label')).toHaveLength(0);
});

test('D and E surface shelves sharing an outline paint D on top', () => {
  const view = mount();

  load(view.store);

  const paths = view.all('path.atc-as');
  const lastE = Math.max(
    ...view.all('path.atc-as.is-e2').map((p) => paths.indexOf(p)),
  );
  const firstD = Math.min(
    ...view.all('path.atc-as.is-d').map((p) => paths.indexOf(p)),
  );
  expect(lastE).toBeLessThan(firstD);
});

test('paint order holds after a shelf is culled and re-added', () => {
  const view = mount();
  load(view.store);

  view.map.setView([30, -100], 10);
  view.map.setView([44.2541, -121.15], 10);

  const paths = view.all('path.atc-as');
  const lastE = Math.max(
    ...view.all('path.atc-as.is-e2').map((p) => paths.indexOf(p)),
  );
  const firstD = Math.min(
    ...view.all('path.atc-as.is-d').map((p) => paths.indexOf(p)),
  );
  expect(lastE).toBeLessThan(firstD);
});
