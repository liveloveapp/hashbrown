import type { B4ToolContext } from '@b4run/sdk';
import { assistantTools } from '../../../assistant-tools';

/** Outstanding invoices grouped into aging buckets past net-30 terms, with the invoice IDs in each bucket and the total open balance. Use for overdue or late-payment questions. */
export default function aging(
  input: {
    /** ISO currency code from ledgerSummary. */
    readonly currency: string;
    /** Restrict to one customer ID; the customer must bill in that currency. */
    readonly customerId?: string;
  },
  context: B4ToolContext,
) {
  return assistantTools(context).aging(input);
}
