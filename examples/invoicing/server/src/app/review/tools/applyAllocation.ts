import type { B4ToolContext } from '@b4run/sdk';
import { reviewTools } from '../../../review-tools';

/**
 * Ends the run when the allocation applies or the user declines (B4 returns
 * the denial as an ordinary tool result): the browser confirms the outcome
 * from the server (`/api/operations/:id`), so a closing model turn would only
 * add latency. Only a failed apply (a thrown error) returns to the model,
 * which then ends with an empty answer.
 */
export const returnDirect = true;

/** Apply the prepared proposal by its proposalId. The runtime pauses this call for the user's approval. */
export default function applyAllocation(
  input: { readonly proposalId: string },
  context: B4ToolContext,
) {
  return reviewTools(context).applyAllocation({ proposalId: input.proposalId });
}
