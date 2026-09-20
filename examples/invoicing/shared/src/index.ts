/** How a client habitually settles invoices; drives the generated history. */
export type PaymentProfile =
  | 'on-time'
  | 'late-fixed'
  | 'late-drifting'
  | 'short-payer'
  | 'batch-payer'
  | 'wrong-reference';
/** A billed client. */
export interface Customer {
  readonly id: string;
  readonly name: string;
  readonly currency: string;
  readonly profile: PaymentProfile;
}
/** A customer-owned money record; amounts are positive safe integer cents. */
export interface MoneyRecord {
  readonly id: string;
  readonly customerId: string;
  /** Human-readable consulting client name. */
  readonly customerName?: string;
  /** Invoice issue or payment receipt date in YYYY-MM-DD format. */
  readonly date?: string;
  /** Invoice number or incoming payment remittance reference. */
  readonly reference?: string;
  /** Description of the invoiced work or incoming payment. */
  readonly description?: string;
  readonly currency: string;
  readonly amountCents: number;
  readonly version: number;
}
/** A committed payment allocation. */
export interface Allocation {
  readonly paymentId: string;
  readonly invoiceId: string;
  readonly amountCents: number;
  readonly proposalId: string;
}
/** An audit entry created with a committed allocation. */
export interface Activity {
  readonly operationId: string;
  readonly proposalId: string;
  readonly description: string;
}
/** Canonical ledger data; remaining balances are derived from allocations. */
export interface Ledger {
  readonly customers: readonly Customer[];
  readonly payments: readonly MoneyRecord[];
  readonly invoices: readonly MoneyRecord[];
  readonly allocations: readonly Allocation[];
  readonly activities: readonly Activity[];
}
/** What one session has changed on top of the shared base ledger. */
export interface LedgerOverlay {
  readonly allocations: readonly Allocation[];
  readonly activities: readonly Activity[];
}
/** Read model with balances derived from the canonical ledger. */
export interface LedgerSnapshot extends Ledger {
  readonly payments: readonly (MoneyRecord & {
    readonly unappliedCents: number;
  })[];
  readonly invoices: readonly (MoneyRecord & {
    readonly outstandingCents: number;
  })[];
}
/** Untrusted request to prepare a payment allocation. */
export interface ProposalRequest {
  readonly paymentId: string;
  readonly invoiceId: string;
  readonly amountCents: number;
}
/** Exact allocation prepared and stored by the server for review. */
export interface Proposal extends ProposalRequest {
  readonly proposalId: string;
  readonly operationId: string;
  readonly generation: number;
  readonly proposalVersion: number;
  readonly expectedPaymentVersion: number;
  readonly expectedInvoiceVersion: number;
  readonly customerId: string;
  readonly currency: string;
}
/** Identity-only decision; authoritative money comes from the stored proposal. */
export interface DecisionRequest {
  readonly proposalId: string;
  readonly operationId: string;
  readonly generation: number;
  readonly proposalVersion: number;
  readonly decision: 'approve' | 'decline';
}
/** Recorded idempotent result of an explicit user decision. */
export interface DecisionResult {
  readonly proposalId: string;
  readonly operationId: string;
  readonly status: 'approved' | 'declined';
  readonly snapshot: LedgerSnapshot;
}

export {
  allocationProposalConfig,
  invoicingUiResponseSchema,
} from './ui-contract';

export {
  assistantTextConfig,
  ledgerTableConfig,
  trendChartConfig,
  agingSummaryConfig,
  customerCardConfig,
  reviewPaymentConfig,
  createAssistantKit,
  assistantResponseSchema,
  type AssistantKitName,
} from './assistant-contract';
export {
  AGING_BUCKETS,
  agingBucket,
  daysBetween,
  monthAt,
  TERMS_DAYS,
  type AgingBuckets,
} from './aging';
export type {
  AssistantRenderInput,
  AssistantLeafNode,
  LedgerTableNode,
  TrendChartNode,
  AgingSummaryNode,
  CustomerCardNode,
  ReviewPaymentNode,
} from './assistant-ui';
