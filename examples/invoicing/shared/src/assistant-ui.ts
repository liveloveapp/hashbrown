/**
 * The tree the assistant composes and hands to `render`. It is deliberately
 * not recursive: prose may contain leaf components, leaves contain nothing.
 * B4 derives the tool's argument schema from these types.
 */
export interface LedgerTableNode {
  readonly LedgerTable: {
    readonly props: {
      /** Short table title. */
      readonly title: string;
      /** Invoice or payment IDs returned by a tool, 1 to 50. */
      readonly recordIds: readonly string[];
    };
  };
}
export interface TrendChartNode {
  readonly TrendChart: {
    readonly props: {
      /** ISO currency code present in the ledger. */
      readonly currency: string;
      /** A customer ID, or null for all customers. */
      readonly customerId: string | null;
      /** Months of history to chart, 3 to 24. */
      readonly months: number;
    };
  };
}
export interface AgingSummaryNode {
  readonly AgingSummary: {
    readonly props: {
      /** ISO currency code present in the ledger. */
      readonly currency: string;
      /** A customer ID, or null for all customers. */
      readonly customerId: string | null;
    };
  };
}
export interface CustomerCardNode {
  readonly CustomerCard: {
    readonly props: {
      /** A customer ID returned by a tool. */
      readonly customerId: string;
    };
  };
}
export interface ReviewPaymentNode {
  readonly ReviewPayment: {
    readonly props: {
      /** An existing unapplied payment ID. */
      readonly paymentId: string;
    };
  };
}
export type AssistantLeafNode =
  | LedgerTableNode
  | TrendChartNode
  | AgingSummaryNode
  | CustomerCardNode
  | ReviewPaymentNode;
export interface AssistantTextNode {
  readonly AssistantText: {
    readonly props: {
      /** Plain prose. No Markdown. */
      readonly text: string;
    };
    /** Components to show under the prose. */
    readonly children?: readonly AssistantLeafNode[];
  };
}
export type AssistantUiNode = AssistantTextNode | AssistantLeafNode;
