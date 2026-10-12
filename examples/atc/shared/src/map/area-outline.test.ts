// @vitest-environment jsdom
import { expect, onTestFinished, test } from 'vitest';
import { AREAS } from '../places';
import { createAtcStore } from '../store';
import { createAreaOutline } from './area-outline';
import { leafletModule, mapElement } from './testing';

/** A real map with an area outline on it. */
async function mount() {
  const L = await leafletModule();
  const element = mapElement();
  const map = L.map(element).setView(
    [AREAS.pnw.view.lat, AREAS.pnw.view.lon],
    AREAS.pnw.view.zoom,
  );
  onTestFinished(() => {
    map.remove();
  });
  const outline = createAreaOutline({ L, map, store: createAtcStore() });

  return { outline, outlines: () => element.querySelectorAll('.atc-area') };
}

test('an area around a known airport draws one faint outline, and none removes it', async () => {
  const { outline, outlines } = await mount();

  outline.sync({ airport: 'KBDN', radiusNm: 10 });
  outline.sync({ airport: 'KSEA', radiusNm: 10 });
  const drawn = outlines().length;
  outline.sync(null);

  expect(drawn).toBe(1);
  expect(outlines()).toHaveLength(0);
});

test('an area around an unknown airport draws nothing', async () => {
  const { outline, outlines } = await mount();

  outline.sync({ airport: 'XXXX', radiusNm: 10 });

  expect(outlines()).toHaveLength(0);
});
