import { tool } from 'langchain';
import { z } from 'zod';

const key = z.string().describe('The key of the state object to retrieve.');

export const getState = tool(
  ({ key }: { key: string }, config) => {
    const { context } = config;

    if (!context) {
      throw new Error('Context is required.');
    }

    const value = context[key];

    if (value === undefined || value === null) {
      return null;
    }

    return typeof value === 'string' ? value : JSON.stringify(value);
  },
  {
    name: 'get_state',
    description: 'Retrieves data from the current graph state.',
    schema: z.object({
      key,
    }),
  },
);
