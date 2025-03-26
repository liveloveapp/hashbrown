import { ZodSchema } from 'zod';
import { toolResultResource } from './tool-result-resource.fn';
import { createTool } from './create-tool.fn';
import { of } from 'rxjs';
import { linkedSignal, Signal } from '@angular/core';

export function naturalLanguageQueryResource<Output extends object>(args: {
  query: Signal<string | null>;
  description: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  outputSchema: ZodSchema<Output>;
  examples?: { input: string; output: Output }[];
}) {
  const input = linkedSignal(args.query);
  const result = linkedSignal<string | null, Output | null>({
    source: input,
    computation: () => {
      return null;
    },
  });
  const tool = createTool({
    name: 'naturalLanguageQuery',
    description: `
      This is the function to call with the result.
    `,
    schema: args.outputSchema,
    handler: (args) => {
      result.set(args);
      return of({ success: true });
    },
  });
  const toolResult = toolResultResource({
    input: args.query,
    description: `
      You are designed to convert natural language queries into structured data.
      The input will be a natural language query, and you will call the
      "naturalLanguageQuery" function with the result of converting the query
      into structured data.

      Here's more context on the task:
      ${args.description}
    `,
    model: args.model,
    temperature: args.temperature,
    maxTokens: args.maxTokens,
    examples: args.examples,
    tool,
  });

  return {
    result: result.asReadonly(),
    isRunning: toolResult.isRunning,
  };
}
