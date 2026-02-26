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
      messages: [{ role: 'human', content: step.prompt }],
    },
    {
      context: {
        airport: state.retrieval?.airport ?? [],
      },
    },
  );

  const steps: GraphState['steps'] = state.steps.slice(1);
  if (!result.structuredResponse) {
    return { steps };
  }

  const existingAirports = state.retrieval?.airport ?? [];
  const newAirports = filterNewAirports(
    existingAirports,
    result.structuredResponse.airport,
  );
  const airport = [...existingAirports, ...newAirports];

  return {
    steps,
    completed: [...(state.completed ?? []), step],
    retrieval: {
      ...(state.retrieval ?? {}),
      airport,
    },
  };
}
