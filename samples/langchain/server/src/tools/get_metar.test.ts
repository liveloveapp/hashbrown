import { describe, expect, it, vi } from 'vitest';
import { createTextResponse, useFetchMock } from '../../vitest.setup.js';

vi.mock('langchain', () => ({
  tool: (impl: unknown, config: Record<string, unknown>) => ({
    ...config,
    invoke: impl,
  }),
}));

type GetMetarTool = {
  invoke: (input: { terminalId: string }) => Promise<string>;
};

async function loadTool(): Promise<{ getMetar: GetMetarTool }> {
  return (await import('./get_metar.js')) as { getMetar: GetMetarTool };
}

describe('getMetar tool', () => {
  it('fetches and returns trimmed METAR data for a valid terminal', async () => {
    const fetchMock = useFetchMock();
    fetchMock.mockResolvedValueOnce(createTextResponse('METAR SAMPLE\n'));

    const { getMetar } = await loadTool();
    const result = await getMetar.invoke({ terminalId: 'kbdn' });

    expect(result).toBe('METAR SAMPLE');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(url);

    expect(parsed.pathname).toBe('/api/data/metar');
    expect(parsed.searchParams.get('ids')).toBe('KBDN');
    expect(parsed.searchParams.get('format')).toBe('raw');
    expect(parsed.searchParams.get('taf')).toBe('true');
    expect(parsed.searchParams.get('hours')).toBe('1.5');
    expect(init?.method).toBe('GET');
    expect(init?.headers).toEqual({ accept: 'application/json' });
  });

  it('normalizes terminal identifiers to uppercase before fetching', async () => {
    const fetchMock = useFetchMock();
    fetchMock.mockResolvedValueOnce(createTextResponse('METAR DATA'));

    const { getMetar } = await loadTool();
    await getMetar.invoke({ terminalId: 'kSfO' });

    const [url] = fetchMock.mock.calls[0] as [string];
    const parsed = new URL(url);

    expect(parsed.searchParams.get('ids')).toBe('KSFO');
  });

  it('throws a descriptive error when the API responds unsuccessfully', async () => {
    const fetchMock = useFetchMock();
    fetchMock.mockResolvedValueOnce(
      createTextResponse('unavailable', {
        status: 502,
        statusText: 'Bad Gateway',
      }),
    );

    const { getMetar } = await loadTool();

    await expect(getMetar.invoke({ terminalId: 'kjfk' })).rejects.toThrow(
      'Error fetching METAR for KJFK: Failed to fetch METAR data: 502 Bad Gateway',
    );
  });

  it('wraps network failures with terminal identifier context', async () => {
    const fetchMock = useFetchMock();
    fetchMock.mockRejectedValueOnce(new Error('network offline'));

    const { getMetar } = await loadTool();

    await expect(getMetar.invoke({ terminalId: 'kedw' })).rejects.toThrow(
      'Error fetching METAR for KEDW: network offline',
    );
  });

  it('trims surrounding whitespace from the METAR response text', async () => {
    const fetchMock = useFetchMock();
    fetchMock.mockResolvedValueOnce(createTextResponse('\n  METAR LINE  \n'));

    const { getMetar } = await loadTool();

    const result = await getMetar.invoke({ terminalId: 'kpdx' });
    expect(result).toBe('METAR LINE');
  });
});
