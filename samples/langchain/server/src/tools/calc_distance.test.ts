import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('langchain', () => ({
  tool: (impl: unknown, config: Record<string, unknown>) => ({
    ...config,
    invoke: impl,
  }),
}));

type CalcDistanceTool = {
  invoke: (input: {
    from: {
      lat: number;
      lon: number;
    };
    to: {
      lat: number;
      lon: number;
    };
  }) => Promise<number>;
};

async function loadTool(): Promise<{ calcDistance: CalcDistanceTool }> {
  return (await import('./calc_distance.js')) as {
    calcDistance: CalcDistanceTool;
  };
}

describe('calcDistance tool', () => {
  it('calculates distance between two points with valid coordinates', async () => {
    const { calcDistance } = await loadTool();

    const from = {
      lat: 44.094722,
      lon: -121.200556,
    };

    const to = {
      lat: 45.588611,
      lon: -122.593056,
    };

    const distance = await calcDistance.invoke({ from, to });

    // KBDN to KPDX is approximately 107-108 nautical miles
    expect(distance).toBeGreaterThan(100);
    expect(distance).toBeLessThan(115);
    expect(typeof distance).toBe('number');
  });

  it('calculates distance correctly for well-known point pairs', async () => {
    const { calcDistance } = await loadTool();

    // JFK to LAX - approximately 2144 nautical miles
    const from = {
      lat: 40.639722,
      lon: -73.778889,
    };

    const to = {
      lat: 33.9425,
      lon: -118.408056,
    };

    const distance = await calcDistance.invoke({ from, to });

    // JFK to LAX is approximately 2144 nautical miles
    expect(distance).toBeGreaterThan(2140);
    expect(distance).toBeLessThan(2150);
  });

  it('calculates zero distance for the same point', async () => {
    const { calcDistance } = await loadTool();

    const point = {
      lat: 39.297,
      lon: -94.714,
    };

    const distance = await calcDistance.invoke({
      from: point,
      to: point,
    });

    expect(distance).toBe(0);
  });

  it('throws an error when from is missing lat', async () => {
    const { calcDistance } = await loadTool();

    const from = {
      lat: NaN,
      lon: -121.200556,
    };

    const to = {
      lat: 45.588611,
      lon: -122.593056,
    };

    await expect(calcDistance.invoke({ from, to })).rejects.toThrow();
  });

  it('throws an error when to is missing lon', async () => {
    const { calcDistance } = await loadTool();

    const from = {
      lat: 44.094722,
      lon: -121.200556,
    };

    const to = {
      lat: 45.588611,
      lon: NaN,
    };

    await expect(calcDistance.invoke({ from, to })).rejects.toThrow();
  });

  it('throws an error when latitude is out of valid range', async () => {
    const { calcDistance } = await loadTool();

    const from = {
      lat: 91.0, // Invalid: > 90
      lon: -121.200556,
    };

    const to = {
      lat: 45.588611,
      lon: -122.593056,
    };

    await expect(calcDistance.invoke({ from, to })).rejects.toThrow(
      'Invalid latitude values',
    );
  });

  it('throws an error when longitude is out of valid range', async () => {
    const { calcDistance } = await loadTool();

    const from = {
      lat: 44.094722,
      lon: 181.0, // Invalid: > 180
    };

    const to = {
      lat: 45.588611,
      lon: -122.593056,
    };

    await expect(calcDistance.invoke({ from, to })).rejects.toThrow(
      'Invalid longitude values',
    );
  });

  it('returns distance rounded to 2 decimal places', async () => {
    const { calcDistance } = await loadTool();

    const from = {
      lat: 44.094722,
      lon: -121.200556,
    };

    const to = {
      lat: 45.588611,
      lon: -122.593056,
    };

    const distance = await calcDistance.invoke({ from, to });

    // Check that the result has at most 2 decimal places
    const decimalPlaces = distance.toString().split('.')[1]?.length ?? 0;
    expect(decimalPlaces).toBeLessThanOrEqual(2);
  });
});
