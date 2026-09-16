import type { B4ToolContext } from '@b4run/sdk';
import { createChatModel } from '@b4run/langchain';
import { isDeepStrictEqual } from 'node:util';
import { assistantTools } from '../../../assistant-tools';

/** Render plain text and an optional validated review action, without financial mutation. */
export default async function respond(
  input: { text: string; paymentId?: string },
  context: B4ToolContext,
) {
  const tools = assistantTools(context);
  if (input.paymentId) tools.validatePayment(input.paymentId);
  const expected = {
    ui: [
      { AssistantText: { props: { text: input.text } } },
      ...(input.paymentId
        ? [{ ReviewPayment: { props: { paymentId: input.paymentId } } }]
        : []),
    ],
  };
  const model = await createChatModel({
    model: 'gpt-5-mini',
    provider: 'openai',
  });
  if (
    !model ||
    typeof model !== 'object' ||
    !('withStructuredOutput' in model) ||
    typeof model.withStructuredOutput !== 'function'
  )
    throw new Error('structured_output_unavailable');
  const renderer = model as {
    withStructuredOutput(
      schema: unknown,
      options: { strict: true; method: 'jsonSchema'; name: string },
    ): { invoke(prompt: string): Promise<unknown> };
  };
  const output = await renderer
    .withStructuredOutput(tools.responseSchema, {
      strict: true,
      method: 'jsonSchema',
      name: 'assistant_ui',
    })
    .invoke(
      `Return exactly this JSON, preserving text and IDs: ${JSON.stringify(expected)}`,
    );
  if (!isDeepStrictEqual(output, expected))
    throw new Error('invalid_assistant_ui');
  return { rendered: true };
}
