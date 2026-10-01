import type { B4ToolContext } from '@b4run/sdk';
import { reviewTools } from '../../../review-tools';

/**
 * Ends the run when the allocation applies: the browser confirms the result
 * from the server (`/api/operations/:id`), so a closing model turn would only
 * add latency. A declined approval or a failed apply still returns to the
 * model, which ends with an empty answer.
 */
export const returnDirect = true;

/** Apply the prepared proposal by its proposalId. The runtime pauses this call for the user's approval. */
export default function applyAllocation(
  input: { readonly proposalId: string },
  context: B4ToolContext,
) {
  return reviewTools(context).applyAllocation({ proposalId: input.proposalId });
}
