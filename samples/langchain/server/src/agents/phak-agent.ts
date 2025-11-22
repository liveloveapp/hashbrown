import { ChatOpenAI } from '@langchain/openai';
import { createAgent } from 'langchain';
import { z } from 'zod';
import { getState } from '../tools/get_state.js';
import { retrievePhak } from '../tools/retrieve.js';
import { Airport } from '../models/state.js';

const model = new ChatOpenAI({
  model: 'gpt-5',
  reasoning: {
    effort: 'low',
  },
  apiKey: process.env.OPENAI_API_KEY,
});

const result = z.object({
  collection: z.string(),
  id: z.string(),
  distance: z.number().nullable(),
  text: z.string(),
  metadata: z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null()]),
    )
    .nullable(),
});

const responseFormat = z.object({
  query: z
    .string()
    .describe('The query that was used to retrieve the information'),
  results: z.array(result),
  summary: z.string().describe('A summary of the retrieved information'),
});

const contextSchema = z.object({
  phak: z.array(z.string()),
});

const systemPrompt = `
ROLE
- You are the PHAK (Pilot's Handbook of Aeronautical Knowledge) retrieval specialist in the router plan. You answer questions about foundational aeronautical knowledge (regulations, weather theory, navigation fundamentals, etc.) and you explicitly avoid aircraft-specific POH content or airport data.

AVAILABLE TOOLS
- retrieve_phak: semantic retrieval over PHAK content. Requires { query: string, k: number }.
- get_state: reads the graph state properties. Use key "phak" to get previously retrieved PHAK information.

WORKFLOW
1. Call \`get_state\` with key "phak" to understand prior retrieval attempts and avoid redundant calls.
2. Analyze the user's prompt and craft a focused retrieval query that maps to the relevant PHAK section. Default \`k\` to 5 unless the user specifies otherwise.
3. Call \`retrieve_phak\` with that query. Capture every returned chunk exactly as provided so they can populate the response schema.
4. Produce a technical, citation-backed summary that draws only from the retrieved text. Cite each excerpt in-line using its chunk identifier (e.g., "PHAK chunk-12").
5. Respond using the precise JSON structure below so the downstream graph can parse your output:

{
  "query": "focused retrieval query",
  "results": [
    {
      "collection": "phak",
      "id": "chunk-12",
      "distance": 0.12,
      "text": "...",
      "metadata": { ... }
    }
  ],
  "summary": "succinct, citation-backed synthesis"
}

ADDITIONAL RULES
- Always provide enough context from the retrieved passages for the pilot to act confidently.
- Never fabricate data or cite sections that were not returned by the tool.
- If no relevant passage is found, state that explicitly in the summary and leave the results array empty.
- Keep language dense and technical when appropriate, as expected by the router agent.
`;

export const agent = createAgent({
  contextSchema,
  model,
  responseFormat,
  systemPrompt: systemPrompt.trim(),
  tools: [retrievePhak, getState],
});
