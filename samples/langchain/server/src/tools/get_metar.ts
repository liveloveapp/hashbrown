import { tool } from 'langchain';
import { z } from 'zod';

/**
 * Fetches METAR (Meteorological Aerodrome Report) data for a specified airport/terminal
 * @param terminalId - The ICAO airport code (e.g., "KBDN", "KJFK")
 * @returns The raw METAR data as a string
 */
export const getMetar = tool(
  async ({ terminalId }: { terminalId: string }) => {
    const normalizedId = terminalId.toUpperCase();

    try {
      const url = new URL('https://aviationweather.gov/api/data/metar');
      url.searchParams.set('ids', normalizedId);
      url.searchParams.set('format', 'raw');
      url.searchParams.set('taf', 'true');
      url.searchParams.set('hours', '1.5');

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch METAR data: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.text();
      return data.trim();
    } catch (error) {
      throw new Error(
        `Error fetching METAR for ${normalizedId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
  {
    name: 'get_metar',
    description:
      'Fetches METAR (Meteorological Aerodrome Report) and TAF (Terminal Aerodrome Forecast) data for a specified airport/terminal using the ICAO code. Returns raw METAR lines followed by TAF forecast data.',
    schema: z.object({
      terminalId: z
        .string()
        .describe('The ICAO airport code (e.g., "KBDN", "KJFK", "KSFO")'),
    }),
  },
);
