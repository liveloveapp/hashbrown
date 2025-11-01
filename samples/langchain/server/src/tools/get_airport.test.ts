import { describe, expect, it, vi } from 'vitest';
import {
  createJsonResponse,
  createTextResponse,
  useFetchMock,
} from '../../vitest.setup.js';

vi.mock('langchain', () => ({
  tool: (impl: unknown, config: Record<string, unknown>) => ({
    ...config,
    invoke: impl,
  }),
}));

type AirportRecord = {
  icaoId?: string | null;
  iataId?: string | null;
  faaId?: string | null;
  name?: string | null;
  state?: string | null;
  country?: string | null;
  source?: string | null;
  type?: string | null;
  lat?: string | number | null;
  lon?: string | number | null;
  elev?: string | number | null;
  magdec?: string | null;
  owner?: string | null;
  runways?: unknown;
};

type GetAirportTool = {
  invoke: (input: { ids: string }) => Promise<{
    airports: Array<{
      icaoId: string;
      name: string;
      iataId: string | null;
      faaId: string | null;
      state: string | null;
      country: string | null;
      source: string | null;
      type: string | null;
      lat: string;
      lon: string;
      elev: string;
      magdec: string | null;
      owner: string | null;
      runways: Array<Record<string, unknown>> | null;
    }>;
  }>;
};

async function loadTool(): Promise<{ getAirport: GetAirportTool }> {
  return (await import('./get_airport.js')) as unknown as {
    getAirport: GetAirportTool;
  };
}

describe('getAirport tool', () => {
  it('returns airport information for a single ICAO code', async () => {
    const airport: AirportRecord = {
      icaoId: 'KMCI',
      iataId: 'MCI',
      faaId: 'MCI',
      name: 'Kansas City Intl',
      state: 'MO',
      country: 'US',
      source: 'FAA',
      type: 'Airport',
      lat: 39.297,
      lon: -94.714,
      elev: 1026,
      magdec: '2E',
      owner: 'City',
      runways: null,
    };

    const fetchMock = useFetchMock();
    fetchMock.mockResolvedValueOnce(createJsonResponse([airport]));

    const { getAirport } = await loadTool();
    const { airports } = await getAirport.invoke({ ids: 'KMCI' });

    expect(airports).toHaveLength(1);
    expect(airports[0]).toMatchObject({
      icaoId: 'KMCI',
      name: 'Kansas City Intl',
    });
    expect(airports[0].lat).toBe('39.297');
    expect(airports[0].lon).toBe('-94.714');

    const [url] = fetchMock.mock.calls[0] as [string];
    const parsed = new URL(url);
    expect(parsed.searchParams.get('ids')).toBe('KMCI');
    expect(parsed.searchParams.get('format')).toBe('json');
  });

  it('supports lookups using IATA codes', async () => {
    const airport: AirportRecord = {
      icaoId: 'KSFO',
      iataId: 'SFO',
      faaId: 'SFO',
      name: 'San Francisco Intl',
      state: 'CA',
      country: 'US',
      source: 'FAA',
      type: 'Airport',
      lat: 37.621,
      lon: -122.379,
      elev: 13,
      magdec: '15E',
      owner: 'City',
      runways: null,
    };

    const fetchMock = useFetchMock();
    fetchMock.mockResolvedValueOnce(createJsonResponse([airport]));

    const { getAirport } = await loadTool();
    const { airports } = await getAirport.invoke({ ids: 'SFO' });

    expect(airports[0]).toMatchObject({ iataId: 'SFO', icaoId: 'KSFO' });
    expect(airports[0].lat).toBe('37.621');

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(new URL(url).searchParams.get('ids')).toBe('SFO');
  });

  it('handles multiple airport codes in a single request', async () => {
    const apiAirports: AirportRecord[] = [
      { icaoId: 'KMCI', name: 'Kansas City Intl' },
      { icaoId: 'KJFK', name: 'John F. Kennedy Intl' },
    ];

    const fetchMock = useFetchMock();
    fetchMock.mockResolvedValueOnce(createJsonResponse(apiAirports));

    const { getAirport } = await loadTool();
    const { airports } = await getAirport.invoke({ ids: 'KMCI,KJFK' });

    expect(airports.map((a) => a.icaoId)).toEqual(['KMCI', 'KJFK']);
  });

  it('always uses json format for the aviation weather API', async () => {
    const fetchMock = useFetchMock();
    fetchMock.mockResolvedValueOnce(createJsonResponse([]));

    const { getAirport } = await loadTool();
    await getAirport.invoke({ ids: 'KMCI' });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(new URL(url).searchParams.get('format')).toBe('json');
  });

  it('throws a descriptive error for non-OK HTTP responses', async () => {
    const fetchMock = useFetchMock();
    fetchMock.mockResolvedValueOnce(
      createTextResponse('service offline', {
        status: 503,
        statusText: 'Service Unavailable',
      }),
    );

    const { getAirport } = await loadTool();

    await expect(getAirport.invoke({ ids: 'KMCI' })).rejects.toThrow(
      'Error fetching airport data for KMCI: Failed to fetch airport data: 503 Service Unavailable. service offline',
    );
  });

  it('surfaces API-level error responses returned in JSON', async () => {
    const fetchMock = useFetchMock();
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({ status: 'error', error: 'Rate limit exceeded' }),
    );

    const { getAirport } = await loadTool();

    await expect(getAirport.invoke({ ids: 'KMCI' })).rejects.toThrow(
      'Error fetching airport data for KMCI: API error: Rate limit exceeded',
    );
  });

  it('propagates schema validation failures from the Airport model', async () => {
    const invalidAirport: AirportRecord = {
      icaoId: 'KMCI',
      name: 'Invalid Airport',
      runways: 'not-an-array',
    };

    const fetchMock = useFetchMock();
    fetchMock.mockResolvedValueOnce(createJsonResponse([invalidAirport]));

    const { getAirport } = await loadTool();

    await expect(getAirport.invoke({ ids: 'KMCI' })).rejects.toThrow(
      /Error fetching airport data for KMCI: /,
    );
  });

  it('normalizes numeric and placeholder values before validation', async () => {
    const fetchMock = useFetchMock();
    fetchMock.mockResolvedValueOnce(
      createJsonResponse([
        {
          icaoId: 'KBDN',
          iataId: '-',
          faaId: '-',
          name: 'BEND/BEND MUNI',
          lat: 44.0946,
          lon: -121.2002,
          elev: 1054,
        },
      ]),
    );

    const { getAirport } = await loadTool();
    const {
      airports: [airport],
    } = await getAirport.invoke({ ids: 'KBDN' });

    expect(airport.iataId).toBeNull();
    expect(airport.faaId).toBeNull();
    expect(airport.lat).toBe('44.0946');
    expect(airport.lon).toBe('-121.2002');
    expect(airport.elev).toBe('1054');
  });

  it('returns an empty array when the response is not an airport list', async () => {
    const fetchMock = useFetchMock();
    fetchMock.mockResolvedValueOnce(createJsonResponse({ data: [] }));

    const { getAirport } = await loadTool();
    const result = await getAirport.invoke({ ids: 'KMCI' });

    expect(result).toEqual({ airports: [] });
  });
});
