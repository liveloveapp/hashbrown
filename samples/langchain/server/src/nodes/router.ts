import { z } from 'zod';
import { agent } from '../agents/router-agent.js';
import { GraphStateSchema } from '../models/state.js';

type GraphState = z.infer<typeof GraphStateSchema>;

export async function router(state: GraphState): Promise<Partial<GraphState>> {
  if (state.steps && state.steps.length > 0) {
    return {};
  }

  const result = await agent.invoke(
    {
      messages: state.messages,
    },
    {
      context: {
        airport: state.retrieval?.airport ?? [],
        phak: state.retrieval?.phak ?? [],
        poh: state.retrieval?.poh ?? [],
        weather: state.retrieval?.weather ?? [],
      },
    },
  );

  const steps = result.structuredResponse.steps;

  return {
    steps,
  };
}
