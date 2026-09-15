import type { B4ToolContext } from '@b4run/sdk';
import { reviewTools } from '../../../review-tools';

/** Read the selected payment and matching invoices from the authorized server session. */
export default function readPayment(
  _input: Record<string, never>,
  context: B4ToolContext,
) {
  return reviewTools(context).readPayment();
}
