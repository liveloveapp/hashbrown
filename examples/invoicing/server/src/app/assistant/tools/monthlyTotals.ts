import type { B4ToolContext } from '@b4run/sdk';
import { assistantTools } from '../../../assistant-tools';

/** Invoiced versus received per calendar month for one currency, optionally one customer, zero-filled. Use for trend or month-over-month questions. */
export default function monthlyTotals(
  input: {
    /** ISO currency code from ledgerSummary. */
    readonly currency: string;
    /** Restrict to one customer ID; the customer must bill in that currency. */
    readonly customerId?: string;
    /** Months of history ending at the as-of month, default 12, max 24. */
    readonly months?: number;
  },
  context: B4ToolContext,
) {
  return assistantTools(context).monthlyTotals(input);
}
