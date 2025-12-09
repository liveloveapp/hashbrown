import { tool } from 'langchain';
import { z } from 'zod';
import { Airport } from '../models/state.js';

type AirportType = z.infer<typeof Airport>;

function normalizeString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const stringValue =
    typeof value === 'string' ? value.trim() : String(value).trim();

  if (stringValue === '' || stringValue === '-') {
    return null;
  }

  return stringValue;
}

function normalizeRequiredString(value: unknown, fallback = ''): string {
  return normalizeString(value) ?? fallback;
}

/**
 * Converts elevation from meters to feet
 * @param value - Elevation value (can be string or number)
 * @returns Elevation in feet as a string, or null if value is invalid
 */
function convertElevationToFeet(value: unknown): string | null {
  const normalized = normalizeString(value);
  if (normalized === null) {
    return null;
  }

  const meters = parseFloat(normalized);
  if (isNaN(meters)) {
    return null;
  }

  const feet = meters * 3.28084;
  return feet.toFixed(1);
}

/**
 * Fetches airport information for specified airport code(s) using the Aviation Weather API
 * @param ids - The ICAO, IATA, or FAA airport code(s). Can be a single code or comma-separated list
 * @param format - Response format: 'decoded' (default), 'json', or 'geojson'
 * @param bbox - Optional geographic bounding box as "lat0,lon0,lat1,lon1"
 * @returns Array of airport information objects
 */
type AirportLookupResult = {
  airports: AirportType[];
};

export const getAirport = tool(
  async ({ ids }: { ids: string }): Promise<AirportLookupResult> => {
    try {
      const url = new URL('https://aviationweather.gov/api/data/airport');
      url.searchParams.set('ids', ids);
      url.searchParams.set('format', 'json');

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          accept: 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to fetch airport data: ${response.status} ${response.statusText}. ${errorText}`,
        );
      }

      const data = (await response.json()) as
        | AirportType[]
        | { status: string; error: string };

      // Handle error response format
      if (
        typeof data === 'object' &&
        data !== null &&
        !Array.isArray(data) &&
        'status' in data &&
        data.status === 'error'
      ) {
        throw new Error(
          `API error: ${('error' in data && data.error) || 'Unknown error'}`,
        );
      }

      // Validate and return the array of airport information
      if (Array.isArray(data)) {
        const airports = data.map((airport) => {
          const completeAirport = {
            icaoId: normalizeRequiredString(airport.icaoId),
            iataId: normalizeString(airport.iataId),
            faaId: normalizeString(airport.faaId),
            name: normalizeRequiredString(airport.name, 'Unknown'),
            state: normalizeString(airport.state),
            country: normalizeString(airport.country),
            source: normalizeString(airport.source),
            type: normalizeString(airport.type),
            lat: normalizeString(airport.lat) ?? '',
            lon: normalizeString(airport.lon) ?? '',
            elev: convertElevationToFeet(airport.elev) ?? '',
            magdec: normalizeString(airport.magdec),
            owner: normalizeString(airport.owner),
            runways: airport.runways ?? null,
          };
          return Airport.parse(completeAirport);
        });
        return { airports };
      }
      return { airports: [] };
    } catch (error) {
      console.error(
        '[get_airport] Failed to fetch airport data:',
        error instanceof Error ? error.message : error,
      );
      throw new Error(
        `Error fetching airport data for ${ids}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
  {
    name: 'get_airport',
    description:
      'Fetches airport information for specified airport code(s) using ICAO, IATA, or FAA codes. Returns airport details including name, location, elevation, and other metadata.',
    schema: z.object({
      ids: z
        .string()
        .describe(
          'The airport code(s). Can be ICAO (e.g., "KMCI"), IATA (e.g., "MCI"), or FAA codes. Multiple codes can be comma-separated (e.g., "KMCI,KJFK")',
        ),
    }),
  },
);
