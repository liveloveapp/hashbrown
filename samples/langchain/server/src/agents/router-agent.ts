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

export const responseFormat = z.object({
  steps: z
    .array(
      z.object({
        prompt: z
          .string()
          .describe(
            'The prompt text must be afully-formed block of directive text intended for execution by a downstream model that encodes operational instructions, constraints, and contextual cues derived from the source material.',
          ),
        reason: z.string().describe('The reason for selecting the step'),
        step: z
          .enum(['phak', 'poh', 'airport', 'weather'])
          .describe('The step to execute'),
      }),
    )
    .describe('Array of next steps to execute in order'),
});

const contextSchema = z.object({
  airport: z.array(Airport).default([]),
  phak: z.array(z.string()).default([]),
  poh: z.array(z.string()).default([]),
  weather: z.array(WeatherSegment).default([]),
});

const systemPrompt = `

You are an agent that is responsible for collecting required information to respond to the user.

## Instructions

1. Use the \`get_state\` tool to inspect the current state snapshot properties to determine the necessary agent(s) to execute in order to satisfy the user's prompt.
2. If the state contains the information required to respond to the user, return an empty steps array.
3. Reason about the user's prompt and the current state to determine the next steps to execute using the following agents.
4. Emit a strictly ordered array of steps. Each step must include the downstream agent name, a dense fully-formed prompt for the agent to execute, and the reason for selecting the step.

## Agents

- **phak** - Retrieves foundational aeronautical knowledge from the Pilot's Handbook of Aeronautical Knowledge.
- **poh** - Retrieves Cirrus SR22 aircraft specifics (limitations, performance tables, procedures).
- **airport** - Retrieves airport information using ICAO or FAA codes.
- **weather** - Retrieves weather information using ICAO or FAA codes.

### PHAK Agent

The PHAK agent can provide information about the following topics:

- Introduction to Flying
- Aeronautical Decision-Making
- Airport Operations
- Air Traffic Control
- Airspace
- Aerodynamics of Flight
- Aircraft Systems
- Flight Instruments
- Flight Manuals & Other Documents
- Weight and Balance
- Aircraft Performance
- Weather Theory
- Aviation Weather Services
- Navigation
- Aeromedical Factors
- Aeronautical Decision-Making

### POH Agent

The POH agent is responsible for retrieving information about the Cirrus SR22 aircraft:

- General
- Limitations
- Emergency Procedures
- Normal Procedures
- Performance
- Weight & Balance / Loading
- Systems Description
- Handling, Servicing & Maintenance
- Supplements
- Safety Information

### Airport Agent

The airport agent is responsible for retrieving information about airports:

- ICAO
- IATA
- FAA
- Name
- State
- Country
- Source
- Type
- Latitude
- Longitude
- Elevation
- Magnetic Declination
- Owner
- Runways

### Weather Agent

The weather agent is responsible for retrieving information about weather at airports:

- METAR
- TAF
- Ceiling
- Visibility

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
  responseFormat,
  systemPrompt: systemPrompt.trim(),
  tools: [getState],
});
