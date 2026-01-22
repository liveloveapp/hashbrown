import { z } from 'zod';
import { agent } from '../agents/finalize-agent.js';
import { GraphStateSchema } from '../models/state.js';

type GraphState = z.infer<typeof GraphStateSchema>;

export async function finalize(
  state: GraphState,
): Promise<Partial<GraphState>> {
  return agent.invoke(state, {
    context: {
      airport: state.retrieval?.airport ?? [],
      phak: state.retrieval?.phak ?? [],
      poh: state.retrieval?.poh ?? [],
      weather: state.retrieval?.weather ?? [],
    },
  });
}
