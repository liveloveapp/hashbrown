import { expect, test, vi } from 'vitest';
import { createBrowserAtcTools } from './browser-tools';
import { createAtcStore } from './store';
import { testChartAirport } from './testing';

test('createBrowserAtcTools loads surfaces for showAirport from the surfaces route', async () => {
  const store = createAtcStore();
  store.setChart({
    cycle: '2610',
    effective: '2026-10-08',
    airports: [testChartAirport()],
  });
  const fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(
      new Response(
        JSON.stringify({ code: 'KRDM', source: 'osm', features: [] }),
      ),
    );
  const tools = createBrowserAtcTools(store);

  const result = await tools.showAirport.handler({ airport: 'KRDM' });
  const urls = fetchSpy.mock.calls.map(([url]) => String(url));
  fetchSpy.mockRestore();

  expect(urls).toEqual(['/api/chart/surfaces?airport=KRDM']);
  expect(result).toMatchObject({ diagram: 'osm' });
});
