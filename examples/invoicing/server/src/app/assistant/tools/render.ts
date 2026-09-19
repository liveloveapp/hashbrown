import type { B4ToolContext } from '@b4run/sdk';
import { createChatModel } from '@b4run/langchain';
// B4's schema compiler builds its own TypeScript program without the app's tsconfig `paths`, so an
// `@invoicing/contracts` import resolves to nothing and the derived schema becomes `{}`; a relative
// import is the only thing it can see. Tracked as an upstream B4 issue: see "Upstream findings", item 3, in
// docs/superpowers/specs/2026-09-19-invoicing-generative-ui-design.md.
// eslint-disable-next-line @nx/enforce-module-boundaries
import type { AssistantRenderInput } from '../../../../../shared/src/assistant-ui';
import { assistantTools } from '../../../assistant-tools';
import { renderUi } from '../../../assistant-ui';

interface UiModel {
  withStructuredOutput(
    schema: unknown,
    options: {
      readonly strict: true;
      readonly method: 'jsonSchema';
      readonly name: string;
    },
  ): { invoke(prompt: string): Promise<unknown> };
}

/** Show your answer to the user. Call exactly once, last. `text` is your prose; `components` are the kit pieces that support it, in order: LedgerTable for specific rows by ID, TrendChart for month-over-month, AgingSummary for overdue balances, CustomerCard for one client, ReviewPayment to offer matching an unapplied payment. Every ID must come from a tool result. On an invalid_ui error, fix the named component and call render once more. */
export default async function render(
  input: AssistantRenderInput,
  context: B4ToolContext,
) {
  const tools = assistantTools(context);
  const tree = await tools.validateUi(input);
  const model = await createChatModel({
    model: 'gpt-5-mini',
    provider: 'openai',
  });
  if (
    typeof model !== 'object' ||
    model === null ||
    !('withStructuredOutput' in model) ||
    typeof model.withStructuredOutput !== 'function'
  )
    throw new Error('structured_output_unavailable');
  const renderer = model as UiModel;
  return renderUi(tree, tools.responseSchema, (schema, canonical, attempt) =>
    renderer
      .withStructuredOutput(schema, {
        strict: true,
        method: 'jsonSchema',
        name: 'assistant_ui',
      })
      .invoke(
        attempt === 0
          ? `Return exactly this JSON, preserving every value and key: ${JSON.stringify(canonical)} Copy every string value exactly, including punctuation, quotes and whitespace; do not correct, trim, translate or reformat anything.`
          : `Your previous output did not match. Return this JSON exactly, character for character, changing nothing: ${JSON.stringify(canonical)} Copy every string value exactly, including punctuation, quotes and whitespace; do not correct, trim, translate or reformat anything.`,
      ),
  );
}
