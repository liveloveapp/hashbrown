import { MessagesZodState } from '@langchain/langgraph';
import * as z from 'zod';

export const Airport = z.object({
  icaoId: z.string().describe('The ICAO airport identifier'),
  iataId: z.string().nullable().describe('The IATA airport identifier'),
  faaId: z.string().nullable().describe('The FAA airport identifier'),
  name: z.string().describe('The name of the airport'),
  state: z
    .string()
    .nullable()
    .describe('The state or province where the airport is located'),
  country: z
    .string()
    .nullable()
    .describe('The country where the airport is located'),
  source: z.string().nullable().describe('The source of the airport data'),
  type: z.string().nullable().describe('The type of airport'),
  lat: z.string().describe('The latitude coordinate of the airport'),
  lon: z.string().describe('The longitude coordinate of the airport'),
  elev: z.string().describe('The elevation of the airport'),
  magdec: z
    .string()
    .nullable()
    .describe('The magnetic declination at the airport'),
  owner: z.string().nullable().describe('The owner of the airport'),
  runways: z
    .array(
      z.record(
        z.string(),
        z.union([z.string(), z.number(), z.boolean(), z.null()]),
      ),
    )
    .nullable()
    .describe('Array of runway information'),
});

export const WeatherSegment = z.object({
  icao: z.string().describe('The ICAO code of the airport'),
  metar: z.string().describe('The METAR weather report'),
  taf: z.string().describe('The TAF weather forecast'),
  ceilingFt: z
    .number()
    .describe('The ceiling height in feet, or null if there is no ceiling'),
  visibilitySm: z.number().describe('The visibility in statute miles'),
  summary: z.string().describe('The summary of the weather'),
  windDirectionDeg: z.number().describe('Wind direction in degrees true'),
  windSpeedKt: z.number().describe('Wind speed in knots'),
  temperatureC: z.number().describe('Temperature in Celsius'),
  dewpointC: z.number().describe('Dewpoint in Celsius'),
  altimeterInHg: z.number().describe('Altimeter setting in inches of mercury'),
});

export const Step = z.object({
  prompt: z.string().describe('The prompt for the step'),
  reason: z.string().describe('The reason for selecting the next step'),
  step: z
    .enum(['phak', 'poh', 'airport', 'weather', 'end'])
    .describe('The step to execute or the end of the graph'),
});

export const GraphStateSchema = z.object({
  messages: MessagesZodState.shape.messages,
  retrieval: z
    .object({
      airport: z.array(Airport).describe('Array of airport information'),
      phak: z
        .array(z.string())
        .describe(
          "Array of Pilot's Handbook of Aeronautical Knowledge search results",
        ),
      poh: z
        .array(z.string())
        .describe("Array of Pilot's Operating Handbook search results"),
      weather: z
        .array(WeatherSegment)
        .describe('Array of weather information for airports'),
    })
    .describe('Retrieval results'),
  completed: z.array(Step).describe('The steps that have been completed'),
  steps: z
    .array(Step)
    .describe(
      'The steps to be executed and the reason for selecting the next step',
    ),
});
