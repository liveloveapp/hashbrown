import type { B4ToolContext } from '@b4run/sdk';
import { createChatModel } from '@b4run/langchain';
import { prepareAllocationUi, reviewTools } from '../../../review-tools';

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

/** Prepare one authoritative allocation across the given invoices, in order, and stream its UI through a nested model call. */
export default async function prepareAllocation(
  input: { readonly invoiceIds: readonly string[] },
  context: B4ToolContext,
) {
  return prepareAllocationUi(
    reviewTools(context),
    input,
    async (schema, proposal) => {
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
      return (model as UiModel)
        .withStructuredOutput(schema, {
          strict: true,
          method: 'jsonSchema',
          name: 'allocation_ui',
        })
        .invoke(
          `Render exactly one AllocationProposal component with props containing only proposalId ${JSON.stringify(proposal.proposalId)}. Return exactly {"ui":[{"AllocationProposal":{"props":{"proposalId":${JSON.stringify(proposal.proposalId)}}}}]}. Do not include narration, additional components, children, or other properties.`,
        );
    },
  );
}
