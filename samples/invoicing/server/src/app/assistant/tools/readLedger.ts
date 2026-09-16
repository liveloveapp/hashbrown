import type { B4ToolContext } from '@b4run/sdk';
import { assistantTools } from '../../../assistant-tools';

/** Read the current visitor's ledger, optionally restricted to one customer. */
export default function readLedger(
  input: { customerId?: string },
  context: B4ToolContext,
) {
  return assistantTools(context).readLedger(input);
}
