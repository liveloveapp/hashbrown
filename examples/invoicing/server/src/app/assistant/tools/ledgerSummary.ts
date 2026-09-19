import type { B4ToolContext } from '@b4run/sdk';
import { assistantTools } from '../../../assistant-tools';

/** Per-currency totals, counts of open invoices and unapplied payments, and the customer list with each client's payment habit (the profile field). Call this first when you do not know where to look. */
export default function ledgerSummary(
  _input: Record<string, never>,
  context: B4ToolContext,
) {
  return assistantTools(context).ledgerSummary();
}
