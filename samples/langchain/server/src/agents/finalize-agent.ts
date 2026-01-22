import { ChatOpenAI } from '@langchain/openai';
import { createAgent } from 'langchain';
import { z } from 'zod';
import { Airport, WeatherSegment } from '../models/state.js';
import { getState } from '../tools/get_state.js';

const model = new ChatOpenAI({
  model: 'gpt-5',
  reasoning: {
    effort: 'minimal',
  },
  apiKey: process.env.OPENAI_API_KEY,
});

const contextSchema = z.object({
  airport: z.array(Airport).default([]),
  phak: z.array(z.string()).default([]),
  poh: z.array(z.string()).default([]),
  weather: z.array(WeatherSegment).default([]),
});

const systemPrompt = `

You are an agent that is responsible for responding to the user's prompt using the information retrieved.

## Instructions

1. Use the \`get_state\` tool to retrieve the current knowledge state.
2. Use the retrieved knowledge state to respond to the user's prompt.

## Tools

- get_state: retrieves the current state snapshot properties.

## State Properties

The \`get_state\` tool can retrieve the following properties:

- airport: airport information retrieved from the airport agent
- phak: PHAK documents retrieved from the phak agent
- poh: POH documents retrieved from the poh agent
- weather: weather information retrieved from the weather agent
`;

export const agent = createAgent({
  contextSchema,
  model,
  systemPrompt: systemPrompt.trim(),
  tools: [getState],
});
