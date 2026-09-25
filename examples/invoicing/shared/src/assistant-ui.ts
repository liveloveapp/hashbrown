/**
 * The input the assistant hands to `render`. It is flat: one block of prose
 * plus the leaf components to show under it. The server builds the Hashbrown
 * node shape (props wrappers, AssistantText children) from it. B4 derives the
 * tool's argument schema from these types, so every property carries JSDoc.
 */
export interface LedgerTableNode {
  /** A table of specific invoices or payments the user asked about. Pass only IDs returned by tools. */
  readonly LedgerTable: {
    /** Short table title. */
    readonly title: string;
    /** Invoice or payment IDs returned by a tool, 1 to 50. */
    readonly recordIds: readonly string[];
  };
}
export interface TrendChartNode {
  /** Monthly invoiced versus received for one currency, optionally one customer. */
  readonly TrendChart: {
    /** ISO currency code present in the ledger. */
    readonly currency: string;
    /** A customer ID. Omit for all customers. */
    readonly customerId?: string;
    /** Whole number of months of history to chart, 3 to 24. */
    readonly months: number;
  };
}
export interface AgingSummaryNode {
  /** Outstanding balance in aging buckets (current, 1-30, 31-60, 61-90, over 90 days past terms) for one currency, optionally one customer. */
  readonly AgingSummary: {
    /** ISO currency code present in the ledger. */
    readonly currency: string;
    /** A customer ID. Omit for all customers. */
    readonly customerId?: string;
  };
}
export interface CustomerCardNode {
  /** One client: name, currency, payment habit, open items. */
  readonly CustomerCard: {
    /** A customer ID returned by a tool. */
    readonly customerId: string;
  };
}
export interface ReviewPaymentNode {
  /** Offer to review one existing unapplied payment. */
  readonly ReviewPayment: {
    /** An existing unapplied payment ID. */
    readonly paymentId: string;
    /** The outstanding invoices this payment settles, in the order to fill, when the match is clear. Omit when it is ambiguous. */
    readonly invoiceIds?: readonly string[] | null;
  };
}
export type AssistantLeafNode =
  | LedgerTableNode
  | TrendChartNode
  | AgingSummaryNode
  | CustomerCardNode
  | ReviewPaymentNode;
export interface AssistantRenderInput {
  /** Plain prose answer. No Markdown. */
  readonly text: string;
  /** Components to show under the prose, in order. */
  readonly components?: readonly AssistantLeafNode[];
}
