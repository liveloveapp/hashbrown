// @vitest-environment jsdom
import { expect, onTestFinished, test } from 'vitest';
import { createAtcStore } from '../../store';
import { squareRing, testChartAirport, testShelf } from '../../testing';
import { intersects, rectAround, rectAt } from '../pixels';
import { leafletModule, mapElement, stubCanvas } from '../testing';
import { shelfLabelAnchor } from './airspace-labels';
import { createChartLayers } from './chart-layers';
import { estimateLabelSize } from './label-placer';

const L = await leafletModule();

const half = 0.06;
const lon = -121.15;
const lat = 44.2541;
const dShelf = testShelf({
  id: 'KRDM-D-0',
  airport: 'KRDM',
  name: 'REDMOND',
  class: 'D',
  type: 'D',
  floor: { ft: 0, ref: 'SFC' },
  ceiling: { ft: 5600, exclusive: false },
  rings: [squareRing(lon, lat, half)],
});
const labelAt = shelfLabelAnchor(dShelf);
/** A ring-only field right on the D box's label point. */
const field = testChartAirport({
  code: 'S33',
  faa: 'S33',
  name: 'NEAR FIELD',
  lat: labelAt.lat,
  lon: labelAt.lon,
  elevationFt: 3000,
  towered: false,
  frequencies: { tower: null, atis: null, ctaf: '122.8', unicom: null },
  runways: [],
});

/**
 * A 400x300 map on the D label point with the chart layers mounted as the
 * app mounts them, syncing with the store.
 */
function mount(zoom: number) {
  stubCanvas();
  const store = createAtcStore();
  const element = mapElement();
  element.className = 'atc-map';
  document.body.append(element);
  const map = L.map(element, {
    zoomAnimation: false,
    fadeAnimation: false,
    markerZoomAnimation: false,
  }).setView([labelAt.lat, labelAt.lon], zoom);
  const chart = createChartLayers({ L, map, store, element });
  const unsubscribe = store.subscribe(() => chart.sync(store.getState()));
  chart.sync(store.getState());
  onTestFinished(() => {
    unsubscribe();
    chart.destroy();
    map.remove();
    element.remove();
  });

  return { store, map, element };
}

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
  const labelPoint = drawnAt(view.map, label as HTMLElement, labelAt);
  const blockPoint = drawnAt(view.map, block as HTMLElement, field);
  const labelSize = estimateLabelSize([label?.textContent ?? '']);
  const blockSize = estimateLabelSize(
    [...(block?.querySelectorAll('span') ?? [])].map(
      (s) => s.textContent ?? '',
    ),
  );
  // An airspace label is centred on its point, a data block hangs from it.
  const labelBox = rectAround(
    labelPoint.x,
    labelPoint.y,
    labelSize.width,
    labelSize.height,
  );
  const blockBox = rectAt(
    blockPoint.x,
    blockPoint.y,
    blockSize.width,
    blockSize.height,
  );

  expect(label).not.toBeNull();
  expect(block).toBeDefined();
  expect(intersects(labelBox, blockBox)).toBe(false);
});
