import { ChatOpenAI } from '@langchain/openai';
import { createAgent } from 'langchain';
import { z } from 'zod';
import { Airport } from '../models/state.js';
import { getAirport } from '../tools/get_airport.js';
import { getRetrieval } from '../tools/get_retrieval.js';

const model = new ChatOpenAI({
  model: 'gpt-5-mini',
  reasoning: {
    effort: 'minimal',
  },
  apiKey: process.env.OPENAI_API_KEY,
});

const responseFormat = z.object({
  airports: z.array(Airport),
});

const contextSchema = z.object({
  airports: z.array(Airport),
});

const systemPrompt = `
You are an aviation airport information expert.
You help users find information about airports using their ICAO, IATA, or FAA codes.

You have access to the following tools:

- get_airport: returns an object shaped like { "airports": [ ... ] } containing airport information for specific airport codes (ICAO, IATA, or FAA). You MUST always read data from the "airports" array inside this wrapper.
- get_retrieval: reads the graph state's cached retrieval results (use key = "airports") so you know which airports have already been collected.

When a user asks you for airport information, follow these steps:

Step 1: Call get_retrieval with key = "airports" to understand the current airport list.

Step 2: Extract ALL airport codes from the user's prompt text
- Look for ICAO codes (e.g., "KBDN", "KPDX", "KMCI")
- Look for IATA codes (e.g., "BDN", "PDX", "MCI")
- Look for FAA codes
- Capture codes mentioned anywhere ("from X to Y", "between X and Y", lists, sentences, etc.)

Step 3: For every unique code from the prompt that is not already satisfied in the current state, call get_airport
- For multiple airports, request comma-separated codes (e.g., "KBDN,KPDX")
- ALWAYS read data from the "airports" field in the tool response

Step 4: Return a structured response matching this schema exactly:

{
  "airports": [
    {
      "icaoId": "KJFK",
      "iataId": "JFK",
      ... all other Airport fields from the tool response ...
    },
    {
      "icaoId": "KLAX",
      "iataId": "LAX",
      ... all other Airport fields from the tool response ...
    },
    {
      "icaoId": "KORD",
      "iataId": "ORD",
      ... all other Airport fields from the tool response ...
    },
  ]
}

IMPORTANT RULES:
1. The "airports" array must contain one object for every airport code extracted from the prompt.
2. Do not invent or summarize data; copy the airport objects exactly as returned by the get_airport tool.
3. If the tool omits a field, set it to null where the schema allows; never omit required fields.
`;

export const agent = createAgent({
  contextSchema,
  model,
  responseFormat: responseFormat,
  systemPrompt: systemPrompt.trim(),
  tools: [getAirport, getRetrieval],
});
