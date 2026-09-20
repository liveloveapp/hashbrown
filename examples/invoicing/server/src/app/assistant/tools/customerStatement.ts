import type { B4ToolContext } from '@b4run/sdk';
import { assistantTools } from '../../../assistant-tools';

/** One client's payment habit, totals, open invoices (up to 50), and unapplied payments (up to 10). Use for any question about a specific customer. */
export default function customerStatement(
  input: {
    /** Customer ID from ledgerSummary. */
    readonly customerId: string;
  },
  context: B4ToolContext,
) {
  return assistantTools(context).customerStatement(input);
}
