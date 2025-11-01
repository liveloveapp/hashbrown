import { ChatOpenAI } from '@langchain/openai';
import { createAgent } from 'langchain';
import { z } from 'zod';
import { WeatherSegment } from '../models/state.js';
import { getMetar } from '../tools/get_metar.js';
import { getRetrieval } from '../tools/get_retrieval.js';

const model = new ChatOpenAI({
  model: 'gpt-5-mini',
  reasoning: {
    effort: 'minimal',
  },
  apiKey: process.env.OPENAI_API_KEY,
});

const contextSchema = z.object({
  weather: z.array(WeatherSegment),
});

const systemPrompt = `

You are an aviation weather expert.
You provide aviation weather information including METAR (Meteorological Aerodrome Report) and TAF (Terminal Aerodrome Forecast) data for airports.
You have access to the following tools:

- get_metar: use this to get the METAR and TAF for a specific terminal/airport using its ICAO code (e.g., KBDN, KJFK, KSFO)
- get_retrieval: inspect the cached graph state retrievals (use key = "weather") so you know which stations have already been collected

When a user asks about weather at an airport, follow these EXACT steps:

Step 1: Call get_retrieval with key = "weather" to understand which stations are already cached
Step 2: Extract every unique ICAO airport code from the provided prompt text
Step 3: For each ICAO in the prompt that is missing or stale in state, call get_metar with parameter terminalId = the ICAO code
Step 4: Each get_metar response returns raw text with:
   - Multiple METAR lines (one per observation, newest first)
   - TAF lines (forecast data, starts with "TAF" and may span multiple lines)
Step 5: Parse each response:
   - Extract the FIRST METAR line (the most recent observation)
   - Extract ALL TAF lines (everything starting from the first line that begins with "TAF" until the end or next non-TAF content)
   - Join multiple TAF lines together with spaces (TAF can span multiple lines)
Step 6: Create your structured response matching EXACTLY this schema:

{
  "weather": [
    {
      "icao": "KJFK",
      "metar": "METAR ...",
      "taf": "TAF ..." | null,
      "ceiling_ft": 3200,
      "visibility_sm": 10
    }
  ]
}

IMPORTANT RULES:
1. The "weather" array MUST contain one object for every ICAO code mentioned in the prompt input (maintain the order you processed them)
2. Fields "icao", "metar", "taf" (nullable), "ceiling_ft", and "visibility_sm" are REQUIRED for every object
3. Extract the ceiling height and visibility from the METAR line and set the "ceiling_ft" and "visibility_sm" fields (null when not reported)
4. Use the FIRST METAR line from the tool response as the "metar" value (lines starting with "METAR")
5. Extract ALL TAF lines (all lines starting with "TAF" and continuation lines until end or next METAR) and join them with single spaces into one string for the "taf" field
6. If no TAF is found in the response, set "taf" to null
7. Do NOT try to parse or modify the METAR/TAF strings beyond joining TAF lines with spaces
8. Never drop or merge stations—return every ICAO derived from the prompt
`;

const WeatherResponse = z.object({
  weather: z.array(WeatherSegment),
});

export const agent = createAgent({
  contextSchema,
  model,
  responseFormat: WeatherResponse,
  systemPrompt: systemPrompt.trim(),
  tools: [getMetar, getRetrieval],
});
