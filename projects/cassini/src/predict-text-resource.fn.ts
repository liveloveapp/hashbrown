import { computed, Signal } from '@angular/core';
import { predictionResource } from './prediction-resource.fn';
import { s } from './schema';

export function predictTextResource(args: {
  input: Signal<string | { before: string; after: string } | null | undefined>;
  description: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  examples?: {
    input: string | { before: string; after: string };
    output: string;
  }[];
}) {
  const outputSchema = s.object('The predicted text', {
    text: s.string('The predicted text'),
  });
  const prediction = predictionResource({
    input: args.input,
    description: `
      In this situation, you will be predicting text. I will give you
      a string of text, and you will predict the next part of the text.

      For exmaple, the input might be:
      <input>
      "Hello, how are you"
      </input>

      And the output might be:
      <output>
      " doing?"
      </output>
    
      In other situations, I might give you a string of text split up into
      two parts. This happens when the user's cursor is in the middle of the text.
      In this case, predict what comes in between the two parts.

      For example, the input might be:
      <input>
      {
        "before": "Hello, how are you",
        "after": " Thanks!"
      }
      </input>
      
      And the output might be:
      <output>
      " doing?"
      </output>

      Here are more specific instructions:
      ${args.description}
    `,
    model: args.model,
    temperature: args.temperature,
    maxTokens: args.maxTokens,
    outputSchema,
    examples: args.examples?.map((example) => ({
      input: example.input,
      output: { text: example.output } as s.Infer<typeof outputSchema>,
    })),
  });

  const output = computed(() => {
    const result = prediction.output();
    if (!result) {
      return null;
    }
    return result.text;
  });

  return {
    output,
    isPredicting: prediction.isPredicting,
  };
}
