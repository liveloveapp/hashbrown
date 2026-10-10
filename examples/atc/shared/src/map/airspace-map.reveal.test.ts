// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import type { Aircraft } from '../aircraft';
import { AREAS } from '../places';
import { createAtcStore } from '../store';
import { createAirspaceMap } from './airspace-map';

const base: Aircraft = {
  hex: 'aaaaaa',
  label: 'UAL100',
  callsign: 'UAL100',
  registration: null,
  typeCode: 'B738',
  category: null,
  kind: 'jet',
  lat: 47.4,
  lon: -122.3,
  altitudeFt: 5000,
  onGround: false,
  groundSpeedKt: 200,
  trackDeg: 90,
  verticalRateFpm: 0,
};
const planes: Aircraft[] = [
  base,
  { ...base, hex: 'bbbbbb', callsign: 'ASA2', lat: 47.45, lon: -122.2 },
  { ...base, hex: 'cccccc', callsign: 'DAL3', lat: 45.6, lon: -122.6 },
];

/**
 * Mounts a 400x300 map with reduced motion. With `sheetTop`, the map sits in
 * a workbench whose chat panel covers the map from that y down, like the
 * phone bottom sheet.
 */
async function mount(sheetTop?: number) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
  }));
  const store = createAtcStore();
  const workbench = document.createElement('main');
  workbench.className = 'atc-workbench';
  const element = document.createElement('div');
  Object.defineProperty(element, 'clientWidth', { value: 400 });
  Object.defineProperty(element, 'clientHeight', { value: 300 });
  element.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 400, bottom: 300 }) as DOMRect;
  let panel: HTMLElement | null = null;
  if (sheetTop !== undefined) {
    panel = document.createElement('section');
    panel.className = 'atc-chat-panel';
    panel.getBoundingClientRect = () =>
      ({ left: 0, top: sheetTop, right: 400, bottom: 300 }) as DOMRect;
    workbench.append(panel);
  }
  workbench.append(element);
  document.body.append(workbench);
  const handle = await createAirspaceMap({
    element,
    store,
    area: AREAS.pnw,
    obstruction: () => panel,
  });
  const px = (value: string | undefined) => parseFloat(value ?? '0') || 0;
  const pane = () => element.querySelector<HTMLElement>('.leaflet-map-pane');
  const pixel = (hex: string) => {
    const icon = element
      .querySelector(`[data-hex="${hex}"]`)
      ?.closest<HTMLElement>('.atc-plane-icon');

    return {
      x: px(icon?.style.left) + px(pane()?.style.left),
      y: px(icon?.style.top) + px(pane()?.style.top),
    };
  };

  return {
    store,
    pixel,
    cleanup: () => {
      handle.destroy();
      workbench.remove();
      vi.unstubAllGlobals();
    },
  };
}

/** Waits out the map's two-frame wait for the sheet to settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 80));

test('revealing a plane picked in the chat centres it', async () => {
  const map = await mount();
  map.store.applySnapshot({ at: 1, aircraft: planes });

  map.store.revealAircraft('cccccc');
  await settle();

  const { x, y } = map.pixel('cccccc');
  expect(Math.hypot(x - 200, y - 150)).toBeLessThan(2);
  expect(map.store.getState().selectedHex).toBe('cccccc');
  map.cleanup();
});

test('a revealed plane lands in the middle of the map left above the sheet', async () => {
  const map = await mount(180);
  map.store.applySnapshot({ at: 1, aircraft: planes });

  map.store.revealAircraft('cccccc');
  await settle();

  const { x, y } = map.pixel('cccccc');
  expect(Math.hypot(x - 200, y - 90)).toBeLessThan(2);
  map.cleanup();
});

test('a highlight fit keeps every plane above the sheet', async () => {
  const map = await mount(180);
  map.store.applySnapshot({ at: 1, aircraft: planes });

  map.store.highlight(['aaaaaa', 'bbbbbb', 'cccccc']);
  await settle();

  const ys = ['aaaaaa', 'bbbbbb', 'cccccc'].map((hex) => map.pixel(hex).y);
  expect(Math.max(...ys)).toBeLessThan(180);
  expect(Math.min(...ys)).toBeGreaterThan(0);
  map.cleanup();
});

test('a revealed plane lands between a docked detail card and the sheet', async () => {
  const map = await mount(180);
  map.store.applySnapshot({ at: 1, aircraft: planes });
  const card = document.querySelector<HTMLElement>(
    '[data-testid="aircraft-detail"]',
  );
  Object.defineProperty(card, 'offsetHeight', { get: () => 60 });

  map.store.revealAircraft('cccccc');
  await settle();

  // The card covers 8 + 60 + 8 px at the top; the sheet starts at 180.
  const { x, y } = map.pixel('cccccc');
  expect(Math.hypot(x - 200, y - (76 + 180) / 2)).toBeLessThan(2);
  map.cleanup();
});
