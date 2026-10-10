// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { AREAS } from '../places';
import { createAtcStore } from '../store';
import { createAirspaceMap } from './airspace-map';

test('an aborted signal resolves to a no-op handle and creates no map', async () => {
  const element = document.createElement('div');
  const controller = new AbortController();
  controller.abort();

  const handle = await createAirspaceMap({
    element,
    store: createAtcStore(),
    area: AREAS.pnw,
    signal: controller.signal,
  });
  handle.destroy();

  expect(element.classList.contains('leaflet-container')).toBe(false);
});
