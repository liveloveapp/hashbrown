import { expect, test, vi } from 'vitest';
import { fetchRoute, parseRoute, routeUrl } from './routes';

const payload = {
  callsign: 'UAL1372',
  _airports: [
    {
      name: 'Los Angeles International Airport',
      iata: 'LAX',
      location: 'Los Angeles',
    },
    {
      name: 'San Francisco International Airport',
      iata: 'SFO',
      location: 'San Francisco',
    },
    {
      name: 'Boston Logan International Airport',
      iata: 'BOS',
      location: 'Boston',
    },
  ],
};

test('routeUrl uses the first two letters of the callsign as the folder', () => {
  const url = routeUrl(' ual1372 ');

  expect(url).toBe('https://vrs-standing-data.adsb.lol/routes/UA/UAL1372.json');
});

test('parseRoute keeps every stop and rejects incomplete routes', () => {
  const route = parseRoute(payload);

  expect(route?.stops.map((stop) => stop.iata)).toEqual(['LAX', 'SFO', 'BOS']);
  expect(parseRoute({ _airports: [payload._airports[0]] })).toBeNull();
  expect(parseRoute('nope')).toBeNull();
});

test('fetchRoute returns null for misses and network errors', async () => {
  const notFound = vi.fn(async () => new Response('', { status: 404 }));
  const broken = vi.fn(async () => {
    throw new TypeError('offline');
  });
  const ok = vi.fn(async () => Response.json(payload));

  const results = await Promise.all([
    fetchRoute('UAL1372', notFound),
    fetchRoute('UAL1372', broken),
    fetchRoute('UAL1372', ok),
  ]);

  expect(results[0]).toBeNull();
  expect(results[1]).toBeNull();
  expect(results[2]?.stops).toHaveLength(3);
});
