import { z } from 'zod';
import { agent } from '../agents/weather-agent.js';
import { GraphStateSchema } from '../models/state.js';

type GraphState = z.infer<typeof GraphStateSchema>;

export async function weather(state: GraphState): Promise<Partial<GraphState>> {
  const step = state.steps[0];
  const result = await agent.invoke(
    {
      messages: [{ role: 'human', content: step.prompt }],
    },
    {
      context: {
        weather: state.retrieval?.weather ?? [],
      },
    },
  );

  const steps: GraphState['steps'] = state.steps.slice(1);

  if (!result.structuredResponse) {
    return { steps };
  }

  const weather = [
    ...(state.retrieval?.weather ?? []),
    ...(result.structuredResponse.weather ?? []),
  ];

  return {
    steps,
    completed: [...(state.completed ?? []), step],
    retrieval: {
      ...(state.retrieval ?? {}),
      weather,
    },
  };
}
