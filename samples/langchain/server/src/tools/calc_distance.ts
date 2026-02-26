import { tool } from 'langchain';
import { z } from 'zod';

/**
 * Coordinate object with latitude and longitude
 */
const coordinateSchema = () =>
  z.object({
    lat: z
      .number()
      .min(-90)
      .max(90)
      .refine((val) => !Number.isNaN(val), {
        message: 'Latitude must be a valid number (not NaN)',
      })
      .describe('Latitude in degrees (-90 to 90)'),
    lon: z
      .number()
      .min(-180)
      .max(180)
      .refine((val) => !Number.isNaN(val), {
        message: 'Longitude must be a valid number (not NaN)',
      })
      .describe('Longitude in degrees (-180 to 180)'),
  });

/**
 * Calculates the great circle distance between two geographic points using their latitude and longitude coordinates
 * @param from - Starting point with lat/lon coordinates as numbers
 * @param to - Destination point with lat/lon coordinates as numbers
 * @returns Distance in nautical miles
 */
export const calcDistance = tool(
  ({
    from,
    to,
  }: {
    from: { lat: number; lon: number };
    to: { lat: number; lon: number };
  }) => {
    try {
      // Validate coordinate ranges (zod schema should handle this, but adding extra validation)
      const lat1 = from.lat;
      const lon1 = from.lon;
      const lat2 = to.lat;
      const lon2 = to.lon;

      // Check for NaN or invalid numbers
      if (
        Number.isNaN(lat1) ||
        Number.isNaN(lon1) ||
        Number.isNaN(lat2) ||
        Number.isNaN(lon2)
      ) {
        throw new Error(
          'Invalid coordinate values: lat and lon must be valid numbers',
        );
      }

      // Validate coordinate ranges
      if (lat1 < -90 || lat1 > 90 || lat2 < -90 || lat2 > 90) {
        throw new Error(
          'Invalid latitude values: must be between -90 and 90 degrees',
        );
      }

      if (lon1 < -180 || lon1 > 180 || lon2 < -180 || lon2 > 180) {
        throw new Error(
          'Invalid longitude values: must be between -180 and 180 degrees',
        );
      }

      // Calculate great circle distance using Haversine formula
      // Earth's radius in nautical miles
      const R = 3440.065; // nautical miles

      // Convert degrees to radians
      const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
      const lat1Rad = toRadians(lat1);
      const lat2Rad = toRadians(lat2);
      const deltaLatRad = toRadians(lat2 - lat1);
      const deltaLonRad = toRadians(lon2 - lon1);

      // Haversine formula
      const a =
        Math.sin(deltaLatRad / 2) ** 2 +
        Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(deltaLonRad / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      // Distance in nautical miles
      const distance = R * c;

      // Round to 2 decimal places for readability
      return Math.round(distance * 100) / 100;
    } catch (error) {
      console.error(
        '[calc_distance] Failed to compute distance:',
        error instanceof Error ? error.message : error,
      );
      throw new Error(
        `Error calculating distance between coordinates: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
  {
    name: 'calc_distance',
    description:
      'Calculates the great circle distance between two geographic points in nautical miles using their latitude and longitude coordinates. Both points must have valid lat/lon coordinates as numbers.',
    schema: z.object({
      from: coordinateSchema().describe(
        'Starting point with latitude and longitude coordinates (lat and lon as numbers)',
      ),
      to: coordinateSchema().describe(
        'Destination point with latitude and longitude coordinates (lat and lon as numbers)',
      ),
    }),
  },
);
