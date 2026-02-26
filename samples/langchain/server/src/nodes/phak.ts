import { z } from 'zod';
import { agent } from '../agents/phak-agent.js';
import { GraphStateSchema } from '../models/state.js';

type GraphState = z.infer<typeof GraphStateSchema>;

export async function phak(state: GraphState): Promise<Partial<GraphState>> {
  const step = state.steps[0];
  const result = await agent.invoke(
    {
      messages: [{ role: 'human', content: step.prompt }],
    },
    {
      context: {
        phak: state.retrieval?.phak ?? [],
      },
    },
  );

  const steps: GraphState['steps'] = state.steps.slice(1);

  if (!result.structuredResponse) {
    return { steps };
  }

  return {
    steps,
    completed: [...(state.completed ?? []), step],
    retrieval: {
      ...(state.retrieval ?? {}),
      phak: [
        ...(state.retrieval?.phak ?? []),
        result.structuredResponse.summary,
      ],
    },
  };
}
