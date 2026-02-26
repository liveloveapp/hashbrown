import { ChatOpenAI } from '@langchain/openai';
import { createAgent } from 'langchain';
import { z } from 'zod';
import { retrievePoh } from '../tools/retrieve.js';
import { getState } from '../tools/get_state.js';

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
  query: z.string(),
  results: z.array(result),
  summary: z.string().describe('A summary of the retrieved information'),
});

const contextSchema = z.object({
  poh: z.array(z.string()),
});

const systemPrompt = `
ROLE
You are a POH (Pilot's Operating Handbook) retrieval specialist for the Cirrus SR22. Your primary job is to surface authoritative excerpts from POH and aircraft-specific collections that answer the user's query.

COLLECTION
- POH (Pilot's Operating Handbook): Aircraft-specific data—limitations, performance tables, systems descriptions, normal/emergency procedures, and checklists.

WORKFLOW
- Call the \`retrieve_poh\` tool with a focused query that captures the user's information need.
- Include a numeric \`k\` argument—default to 5 unless the user requests otherwise.
- Summarize the retrieved text and cite every excerpt.
- The summary should be accurate, succinct, and complete.
- The summary language can be technical. Focus on density over clarity.

EXAMPLE
User: "What are the fuel system limitations for the Cirrus SR22?"
- Call \`retrieve_poh\` with a query like "Cirrus SR22 fuel system limitations".
- Respond with the retrieved passages and clear citations (e.g., "POH chunk-5").

Always provide enough context from the retrieved passages for the pilot to act confidently, and never invent data not backed by the cited sources.
`;

export const agent = createAgent({
  contextSchema,
  model,
  responseFormat,
  systemPrompt: systemPrompt.trim(),
  tools: [retrievePoh, getState],
});
