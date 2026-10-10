// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import type { Aircraft } from '../aircraft';
import { AREAS } from '../places';
import { createAtcStore } from '../store';
import { createAirspaceMap } from './airspace-map';

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

/** Mounts a map with reduced motion and one Cessna and one jet. */
async function mount() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
  }));
  const store = createAtcStore();
  const element = document.createElement('div');
  document.body.append(element);
  Object.defineProperty(element, 'clientWidth', { value: 400 });
  Object.defineProperty(element, 'clientHeight', { value: 300 });
  const handle = await createAirspaceMap({ element, store, area: AREAS.pnw });
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
      element.remove();
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
  expect(map.card()?.textContent).toContain('Pressure altitude4,500 ft');
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
  expect(card?.textContent).toContain('Pressure altitude4,600 ft');
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
