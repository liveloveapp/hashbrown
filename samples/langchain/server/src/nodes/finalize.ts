import { z } from 'zod';
import { agent } from '../agents/finalize-agent.js';
import { GraphStateSchema } from '../models/state.js';

type GraphState = z.infer<typeof GraphStateSchema>;

export async function finalize(
  state: GraphState,
): Promise<Partial<GraphState>> {
  const result = await agent.invoke(state, {
    context: {
      airports: state.retrieval?.airports ?? [],
      phak: state.retrieval?.phak ?? [],
      poh: state.retrieval?.poh ?? [],
      weather: state.retrieval?.weather ?? [],
    },
  });

  return {
    messages: [...state.messages, ...result.messages],
  };
}
