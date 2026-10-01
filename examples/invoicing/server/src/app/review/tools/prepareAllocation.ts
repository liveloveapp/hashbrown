import type { B4ToolContext } from '@b4run/sdk';
import { reviewTools } from '../../../review-tools';

/** Prepare the server-owned allocation proposal for the selected payment and invoices. Takes no input: the server already knows the selection. Returns the proposal, including its proposalId. */
export default function prepareAllocation(
  _input: Record<string, never>,
  context: B4ToolContext,
) {
  return reviewTools(context).prepareAllocation();
}
