import type { B4ToolContext } from '@b4run/sdk';
import { assistantTools } from '../../../assistant-tools';

/** Search invoices and payments by customer, currency, status, free text, or date range. Returns record IDs you can show in a LedgerTable; balance is the outstanding amount on an invoice or the unapplied amount on a payment. Newest first, capped at 50; total reports how many matched. */
export default function findRecords(
  input: {
    /** Only invoices or only payments; omit for both. */
    readonly kind?: 'invoice' | 'payment';
    /** Customer ID from ledgerSummary. */
    readonly customerId?: string;
    /** ISO currency code. */
    readonly currency?: string;
    /** open: outstanding or unapplied balance; settled: fully applied. */
    readonly status?: 'open' | 'settled';
    /** Case-insensitive match on reference, description, customer name, or ID. */
    readonly text?: string;
    /** Earliest date, YYYY-MM-DD. */
    readonly from?: string;
    /** Latest date, YYYY-MM-DD. */
    readonly to?: string;
    /** Rows to return, default 20, max 50. */
    readonly limit?: number;
  },
  context: B4ToolContext,
) {
  return assistantTools(context).findRecords(input);
}
