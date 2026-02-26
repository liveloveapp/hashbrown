import { END } from '@langchain/langgraph';
import { GraphStateSchema } from '../models/state.js';
import { z } from 'zod';

export function next(state: z.infer<typeof GraphStateSchema>): string {
  const steps = state.steps;

  if (steps.length === 0) {
    return END;
  }

  return steps[0].step;
}
