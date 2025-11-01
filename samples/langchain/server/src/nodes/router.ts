import { z } from 'zod';
import { agent } from '../agents/router-agent.js';
import { GraphStateSchema } from '../models/state.js';

type GraphState = z.infer<typeof GraphStateSchema>;

export async function router(state: GraphState): Promise<Partial<GraphState>> {
  if (state.steps && state.steps.length > 0) {
    return {};
  }

  const messages =
    state.messages.find((message) => message.type === 'human') ?? [];
  const result = await agent.invoke(
    {
      messages,
    },
    {
      context: {
        airports: state.retrieval?.airports ?? [],
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
