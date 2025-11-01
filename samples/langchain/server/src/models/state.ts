import * as z from 'zod';

export const Airport = z.object({
  icaoId: z.string(),
  iataId: z.string().nullable(),
  faaId: z.string().nullable(),
  name: z.string(),
  state: z.string().nullable(),
  country: z.string().nullable(),
  source: z.string().nullable(),
  type: z.string().nullable(),
  lat: z.string(),
  lon: z.string(),
  elev: z.string(),
  magdec: z.string().nullable(),
  owner: z.string().nullable(),
  runways: z
    .array(
      z.record(
        z.string(),
        z.union([z.string(), z.number(), z.boolean(), z.null()]),
      ),
    )
    .nullable(),
});
export type Airport = z.infer<typeof Airport>;

export const AirportDistance = z.object({
  from: z.string(),
  to: z.string(),
  distance_nm: z.number(),
});
export type AirportDistance = z.infer<typeof AirportDistance>;

export const Leg = z.object({
  from: z.string().describe('Departure airport ICAO code'),
  to: z.string().describe('Arrival airport ICAO code'),
  distance: z.number().describe('Distance in nautical miles'),
});

export const Route = z.object({
  rules: z.enum(['VFR', 'IFR']),
  legs: z.array(Leg),
});

export const WeatherSegment = z.object({
  icao: z.string(),
  metar: z.string(),
  taf: z.string().nullable(),
  ceiling_ft: z.number().nullable(),
  visibility_sm: z.number().nullable(),
  wind_dir_deg: z.number().nullable(),
  wind_spd_kt: z.number().nullable(),
  hazards: z.array(z.enum(['icing', 'ts', 'llws', 'ifr', 'mvfr'])).nullable(),
});

export const Notam = z.object({
  id: z.string(),
  text: z.string(),
  start: z.string(),
  end: z.string(),
  geometry: z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null()]),
    )
    .nullable(), // GeoJSON
  kind: z.enum(['RWY', 'NAV', 'TFR', 'SUA', 'OTHER']),
});
export type Notam = z.infer<typeof Notam>;

export const Moment = z.object({
  name: z.string().describe('The name of the moment'),
  value: z.number().describe('The value of the moment in inches'),
});
export type Moment = z.infer<typeof Moment>;

export const Performance = z.object({
  tow: z.number().describe('Takeoff weight in pounds'),
  cg: z.number().describe('Center of gravity in inches'),
  takeoff_dist: z.number().describe('Takeoff distance in feet'),
  landing_dist: z.number().describe('Landing distance in feet'),
  density_altitude: z.number().describe('Density altitude in feet'),
  notes: z.array(z.string()).optional().describe('Notes about the performance'),
});
export type Performance = z.infer<typeof Performance>;

export const Aircraft = z.object({
  type: z.string().describe('The type of aircraft'),
  tas: z.number().describe('The true airspeed in knots'),
  fuel_burn: z.number().describe('The fuel burn in gallons per hour'),
  weights: z.object({
    empty: z.number().describe('The empty weight in pounds'),
    max_to: z.number().describe('The maximum takeoff weight in pounds'),
    max_ldg: z.number().describe('The maximum landing weight in pounds'),
  }),
  moments: z.array(Moment),
});
export type Aircraft = z.infer<typeof Aircraft>;

export const FuelPlan = z.object({
  total_gal: z.number().describe('Total gallons of fuel'),
  reserve_gal: z.number().describe('Reserve gallons of fuel'),
  legs: z
    .array(z.object({ legIndex: z.number(), gal: z.number() }))
    .describe('Fuel for each leg'),
});

// export const RiskAssessment = z.object({
//   overall: z.enum(['LOW', 'MODERATE', 'HIGH']),
//   items: z.array(
//     z.object({
//       item: z.string(),
//       level: z.enum(['L', 'M', 'H']),
//       reason: z.string(),
//     }),
//   ),
//   legality: z.array(z.string()).optional(), // e.g., “IFR alt required; 1-2-3 not met”
// });

export const FlightPlan = z.object({
  id: z.string().describe('The ID of the flight plan'),
  rules: z
    .enum(['VFR', 'IFR'])
    .default('VFR' as const)
    .describe('The flight rules of the flight plan'),
  origin: z.string().describe('The departure airport ICAO code'),
  destination: z.string().describe('The arrival airport ICAO code'),
  etd_iso: z.string().describe('The estimated departure time in ISO format'),
  pax: z.number().default(1).describe('The number of passengers on the flight'),
  aircraft: Aircraft.describe('The aircraft used for the flight'),
  route: Route.describe('The route of the flight'),
  weather: z
    .array(WeatherSegment)
    .describe('The weather at the airports along the route'),
  notams: z.array(Notam).describe('The NOTAMs for the flight'),
  //performance: Performance.describe('The performance of the flight'),
  fuel: FuelPlan.describe('The fuel plan for the flight'),
});
export type FlightPlan = z.infer<typeof FlightPlan>;
