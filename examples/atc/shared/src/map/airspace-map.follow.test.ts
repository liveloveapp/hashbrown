// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import type { Aircraft } from '../aircraft';
import { AREAS } from '../places';
import { createAtcStore } from '../store';
import { createAirspaceMap } from './airspace-map';

const plane: Aircraft = {
  hex: 'a1b2c3',
  label: 'UAL1802',
  callsign: 'UAL1802',
  registration: null,
  typeCode: 'B738',
  category: null,
  kind: 'jet',
  lat: 44,
  lon: -121,
  altitudeFt: 30000,
  onGround: false,
  groundSpeedKt: 450,
  trackDeg: 90,
  verticalRateFpm: 0,
};

/** Mounts a 400x300 map with reduced motion and one followed-ready plane. */
async function mount() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
  }));
  const store = createAtcStore();
  const element = document.createElement('div');
  Object.defineProperty(element, 'clientWidth', { value: 400 });
  Object.defineProperty(element, 'clientHeight', { value: 300 });
  document.body.append(element);
  const handle = await createAirspaceMap({ element, store, area: AREAS.pnw });
  store.applySnapshot({ at: 1, aircraft: [plane] });
  const pill = () =>
    element.querySelector<HTMLElement>('[data-testid="follow-pill"]');
  return {
    store,
    pill,
    cleanup: () => {
      handle.destroy();
      element.remove();
      vi.unstubAllGlobals();
    },
  };
}

test('following shows a pill with the label and a Stop button that ends it', async () => {
  const map = await mount();

  map.store.follow('a1b2c3');
  const text = map.pill()?.textContent;
  map.pill()?.querySelector('button')?.click();

  expect(text).toBe('Following UAL1802Stop');
  expect(map.store.getState().followingHex).toBeNull();
  expect(map.pill()?.classList.contains('is-open')).toBe(false);
  map.cleanup();
});
