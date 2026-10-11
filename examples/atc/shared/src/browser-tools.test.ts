import { expect, test, vi } from 'vitest';
import { createBrowserAtcTools } from './browser-tools';
import { createAtcStore } from './store';

test('createBrowserAtcTools loads surfaces for showAirport from the surfaces route', async () => {
  const store = createAtcStore();
  store.setChart({
    cycle: '2610',
    effective: '2026-10-08',
    airports: [
      {
        code: 'KRDM',
        faa: 'RDM',
        name: 'ROBERTS FLD/REDMOND MUNI',
        city: 'REDMOND',
        state: 'OR',
        aliases: [],
        lat: 44.254,
        lon: -121.15,
        elevationFt: 3082,
        kind: 'airport',
        towered: true,
        towerPartTime: true,
        frequencies: { tower: null, atis: null, ctaf: null, unicom: null },
        weather: null,
        lighting: 'limited',
        fuel: true,
        military: false,
        runways: [],
        rank: 0,
      },
    ],
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
