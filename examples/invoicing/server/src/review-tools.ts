import { isDeepStrictEqual } from 'node:util';
import type { Proposal } from '@invoicing/contracts';
import type { createReviewMiddleware } from './review-middleware';

type ReviewTools = Extract<
  ReturnType<ReturnType<typeof createReviewMiddleware>>,
  { action: 'continue' }
>['context'];

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Resolve validated server middleware capabilities before running a review tool. */
export function reviewTools(context: unknown): ReviewTools {
  if (!record(context) || !record(context.middleware))
    throw new Error('invalid_review_middleware');
  const middleware = context.middleware;
  if (
    !record(middleware.responseSchema) ||
    typeof middleware.readPayment !== 'function' ||
    typeof middleware.prepareAllocation !== 'function' ||
    typeof middleware.applyAllocation !== 'function'
  )
    throw new Error('invalid_review_middleware');
  return middleware as ReviewTools;
}

/** Prepare a server-owned proposal and verify that generated UI preserves its identity. */
export async function prepareAllocationUi(
  middleware: ReviewTools,
  input: { readonly invoiceId: string },
  render: (schema: unknown, proposal: Proposal) => Promise<unknown>,
): Promise<Proposal> {
  const proposal = middleware.prepareAllocation({ invoiceId: input.invoiceId });
  const output = await render(middleware.responseSchema, proposal);
  const expected = {
    ui: [
      { AllocationProposal: { props: { proposalId: proposal.proposalId } } },
    ],
  };
  if (!isDeepStrictEqual(output, expected))
    throw new Error('invalid_allocation_ui');
  return proposal;
}
