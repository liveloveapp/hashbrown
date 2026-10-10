// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import type { Aircraft } from '../aircraft';
import { AREAS } from '../places';
import { createAtcStore } from '../store';
import { createAirspaceMap } from './airspace-map';

/** The whole region at zoom 6, so every test plane is on the 400 by 300 map. */
const REGIONAL = {
  ...AREAS.pnw,
  view: { lat: AREAS.pnw.lat, lon: AREAS.pnw.lon, zoom: 6 },
};

const cessna: Aircraft = {
  hex: 'a1c009',
  label: 'N352LL',
  callsign: 'N352LL',
  registration: 'N352LL',
  typeCode: 'C172',
  category: 'A1',
  kind: 'single',
  lat: 44.12,
  lon: -123.21,
  altitudeFt: 4500,
  onGround: false,
  groundSpeedKt: 110,
  trackDeg: 300,
  verticalRateFpm: 0,
  squawk: '1200',
};
const jet: Aircraft = {
  ...cessna,
  hex: 'a1c001',
  label: 'ASA301',
  callsign: 'ASA301',
  registration: null,
  lat: 44.2,
};

/** A rect stub with these edges. */
function rect(top: number, bottom: number): DOMRect {
  return { left: 0, right: 400, top, bottom } as DOMRect;
}

/**
 * Mounts a 400x300 map with reduced motion and one Cessna and one jet,
 * inside a workbench whose chat panel starts its sheet at `sheetTop`.
 */
async function mount(sheetTop: { value: number } | null = null) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
  }));
  const store = createAtcStore();
  const workbench = document.createElement('main');
  workbench.className = 'atc-workbench';
  const element = document.createElement('div');
  workbench.append(element);
  let panel: HTMLElement | null = null;
  if (sheetTop !== null) {
    panel = document.createElement('section');
    panel.className = 'atc-chat-panel';
    panel.getBoundingClientRect = () => rect(sheetTop.value, 300);
    workbench.append(panel);
  }
  document.body.append(workbench);
  Object.defineProperty(element, 'clientWidth', { value: 400 });
  Object.defineProperty(element, 'clientHeight', { value: 300 });
  const handle = await createAirspaceMap({
    element,
    store,
    area: REGIONAL,
    obstruction: () => panel,
  });
  store.applySnapshot({ at: 1, aircraft: [cessna, jet] });
  const icon = (hex: string) =>
    element
      .querySelector(`[data-hex="${hex}"]`)
      ?.closest<HTMLElement>('.atc-plane-icon');
  const mouse = (hex: string, type: 'mouseover' | 'mouseout') =>
    icon(hex)?.dispatchEvent(new MouseEvent(type, { bubbles: true }));
  const card = () =>
    element.querySelector<HTMLElement>('[data-testid="aircraft-detail"]');
  const open = () => card()?.classList.contains('is-open') ?? false;

  return {
    store,
    element,
    mouse,
    card,
    open,
    plane: (hex: string) =>
      element.querySelector<HTMLElement>(`.atc-plane[data-hex="${hex}"]`),
    cleanup: () => {
      handle.destroy();
      workbench.remove();
      vi.unstubAllGlobals();
    },
  };
}

test('hovering a plane opens one detail card with its readings', async () => {
  const map = await mount();

  map.mouse('a1c009', 'mouseover');

  expect(map.element.querySelectorAll('.atc-detail')).toHaveLength(1);
  expect(map.open()).toBe(true);
  expect(map.card()?.textContent).toContain('RegistrationN352LL');
  expect(map.card()?.textContent).toContain('Altitude4,500 ft');
  expect(map.card()?.textContent).toContain('Squawk1200');
  expect(map.plane('a1c009')?.classList.contains('is-detailed')).toBe(true);
  map.cleanup();
});

test('leaving the plane hides the card unless it is selected', async () => {
  const map = await mount();
  map.mouse('a1c009', 'mouseover');

  map.mouse('a1c009', 'mouseout');
  const afterLeave = map.open();
  map.store.select('a1c001');
  const selected = map.card()?.getAttribute('data-hex');
  map.mouse('a1c009', 'mouseover');
  const hovered = map.card()?.getAttribute('data-hex');
  map.mouse('a1c009', 'mouseout');

  expect(afterLeave).toBe(false);
  expect(selected).toBe('a1c001');
  expect(hovered).toBe('a1c009');
  expect(map.open()).toBe(true);
  expect(map.card()?.getAttribute('data-hex')).toBe('a1c001');
  expect(map.plane('a1c009')?.classList.contains('is-detailed')).toBe(false);
  map.cleanup();
});

test('a new snapshot updates the open card in place', async () => {
  const map = await mount();
  map.mouse('a1c009', 'mouseover');
  const card = map.card();

  map.store.applySnapshot({
    at: 2,
    aircraft: [{ ...cessna, altitudeFt: 4600 }, jet],
  });

  expect(map.card()).toBe(card);
  expect(card?.textContent).toContain('Altitude4,600 ft');
  map.cleanup();
});

test('Escape clears the selection and hides the card', async () => {
  const map = await mount();
  map.store.select('a1c009');

  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

  expect(map.store.getState().selectedHex).toBeNull();
  expect(map.open()).toBe(false);
  map.cleanup();
});

test('the card hides when its plane leaves the map', async () => {
  const map = await mount();
  map.mouse('a1c009', 'mouseover');

  map.store.applySnapshot({ at: 2, aircraft: [jet] });

  expect(map.open()).toBe(false);
  map.cleanup();
});

test('Escape while typing in a field keeps the selection', async () => {
  const map = await mount();
  const input = document.createElement('textarea');
  document.body.append(input);
  map.store.select('a1c009');

  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
  const prevented = new KeyboardEvent('keydown', {
    key: 'Escape',
    cancelable: true,
  });
  prevented.preventDefault();
  document.dispatchEvent(prevented);

  expect(map.store.getState().selectedHex).toBe('a1c009');
  expect(map.open()).toBe(true);
  input.remove();
  map.cleanup();
});

test('the card hides under an expanded sheet and returns when it shrinks', async () => {
  const sheetTop = { value: 0 };
  const map = await mount(sheetTop);
  map.mouse('a1c009', 'mouseover');
  const underSheet = map.open();

  sheetTop.value = 300;
  window.dispatchEvent(new Event('resize'));

  expect(underSheet).toBe(false);
  expect(map.open()).toBe(true);
  map.cleanup();
});

test('the card hides when its plane moves off screen', async () => {
  const map = await mount();
  map.store.select('a1c009');

  map.store.applySnapshot({
    at: 2,
    aircraft: [{ ...cessna, lat: 30, lon: -100 }, jet],
  });

  expect(map.open()).toBe(false);
  map.cleanup();
});

test('a selected plane gets a pinned card whose close button clears the selection', async () => {
  const map = await mount();
  map.mouse('a1c009', 'mouseover');
  map.store.select('a1c009');

  map.card()?.querySelector<HTMLElement>('.atc-detail-close')?.click();

  expect(map.store.getState().selectedHex).toBeNull();
  expect(map.open()).toBe(false);
  map.cleanup();
});

test('on a narrow map the card docks at the top with its summary only', async () => {
  const map = await mount();

  map.store.select('a1c009');

  expect(map.card()?.classList.contains('is-docked')).toBe(true);
  expect(map.card()?.style.transform).toBe('translate(8px, 8px)');
  expect(map.card()?.textContent).toContain('More readings');
  expect(map.card()?.textContent).not.toContain('Squawk');
  map.cleanup();
});

test('More opens every reading in the docked card and keeps the plane selected', async () => {
  const map = await mount();
  map.store.select('a1c009');

  map.card()?.querySelector<HTMLElement>('.atc-detail-more')?.click();

  expect(map.store.getState().selectedHex).toBe('a1c009');
  expect(map.open()).toBe(true);
  expect(map.card()?.textContent).toContain('Squawk1200');
  map.cleanup();
});

test('the focused close button stays focused through the age ticker and new snapshots', async () => {
  const map = await mount();
  map.store.select('a1c009');
  const close = map.card()?.querySelector<HTMLElement>('.atc-detail-close');
  close?.focus();

  map.store.applySnapshot({
    at: 2,
    aircraft: [{ ...cessna, altitudeFt: 4600, seenS: 1 }, jet],
  });
  await new Promise((resolve) => setTimeout(resolve, 1100));
  map.store.applySnapshot({
    at: 3,
    aircraft: [{ ...cessna, altitudeFt: 4700, seenS: 2 }, jet],
  });

  expect(close?.isConnected).toBe(true);
  expect(document.activeElement).toBe(close);
  expect(map.card()?.textContent).toContain('4,700 ft');
  map.cleanup();
});
