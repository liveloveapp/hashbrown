import { z } from 'zod';
import { agent } from '../agents/airport-agent.js';
import { Airport, GraphStateSchema } from '../models/state.js';

type GraphState = z.infer<typeof GraphStateSchema>;
type AirportType = z.infer<typeof Airport>;

function filterNewAirports(
  existing: AirportType[],
  additions: AirportType[],
): AirportType[] {
  const seen = new Set(existing.map((airport) => airport.icaoId));
  return additions.filter((airport) => !seen.has(airport.icaoId));
}

export async function airport(state: GraphState): Promise<Partial<GraphState>> {
  const step = state.steps[0];
  const result = await agent.invoke(
    {
      messages: [{ role: 'ai', content: step.prompt }],
    },
    {
      context: {
        airports: state.retrieval?.airports ?? [],
      },
    },
  );

  const steps: GraphState['steps'] = state.steps.filter(
    (s) => s.step !== 'airport',
  );

  if (!result.structuredResponse) {
    return { steps };
  }

  const existingAirports = state.retrieval?.airports ?? [];
  const newAirports = filterNewAirports(
    existingAirports,
    result.structuredResponse.airports,
  );
  const airports = [...existingAirports, ...newAirports];

  return {
    steps,
    retrieval: {
      ...(state.retrieval ?? {}),
      airports,
    },
  };
}
