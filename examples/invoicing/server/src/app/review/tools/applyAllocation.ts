import type { B4ToolContext } from '@b4run/sdk';
import { reviewTools } from '../../../review-tools';

/** Apply the server-owned proposal only after runtime approval resumes this tool. */
export default function applyAllocation(
  input: { readonly proposalId: string },
  context: B4ToolContext,
) {
  return reviewTools(context).applyAllocation({ proposalId: input.proposalId });
}
