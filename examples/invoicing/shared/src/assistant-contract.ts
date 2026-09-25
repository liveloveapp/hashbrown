import { s, ɵcreateUiKit } from '@hashbrownai/core';

const nullableCustomerId = () =>
  s.anyOf([s.string('A customer ID'), s.nullish()]);
const nullableInvoiceIds = () =>
  s.anyOf([
    s.array(
      'Outstanding invoice IDs this payment settles, in the order to fill',
      s.string('An outstanding invoice ID'),
    ),
    s.nullish(),
  ]);

/** Plain prose that may carry other kit components under it. */
export const assistantTextConfig = {
  name: 'AssistantText',
  description:
    'A plain text answer grounded in the ledger. Put components that support the answer in its children.',
  props: { text: s.string('Answer text, no Markdown') },
} as const;

/** A grid of specific invoices or payments the model chose, by ID. */
export const ledgerTableConfig = {
  name: 'LedgerTable',
  description:
    'A table of specific invoices or payments the user asked about. Pass only IDs returned by tools.',
  children: false,
  props: {
    title: s.string('Short table title'),
    recordIds: s.array(
      'Invoice or payment IDs, 1 to 50',
      s.string('An invoice or payment ID'),
    ),
  },
} as const;

/** Monthly invoiced versus received, computed on the client from the snapshot. */
export const trendChartConfig = {
  name: 'TrendChart',
  description:
    'Monthly invoiced versus received for one currency, optionally one customer.',
  children: false,
  props: {
    currency: s.string('ISO currency code present in the ledger'),
    customerId: nullableCustomerId(),
    months: s.integer('Months of history to chart, 3 to 24'),
  },
} as const;

/** Open balance by aging bucket, computed on the client from the snapshot. */
export const agingSummaryConfig = {
  name: 'AgingSummary',
  description:
    'Outstanding balance in aging buckets (current, 1-30, 31-60, 61-90, over 90 days past terms) for one currency, optionally one customer.',
  children: false,
  props: {
    currency: s.string('ISO currency code present in the ledger'),
    customerId: nullableCustomerId(),
  },
} as const;

/** One client's profile and balances. */
export const customerCardConfig = {
  name: 'CustomerCard',
  description: 'One client: name, currency, payment habit, open items.',
  children: false,
  props: { customerId: s.string('A customer ID returned by a tool') },
} as const;

/** An explicit user action that opens a separately authorized payment review. */
export const reviewPaymentConfig = {
  name: 'ReviewPayment',
  description:
    'Offer to match one existing unapplied payment, optionally to the outstanding invoices it settles.',
  children: false,
  props: {
    paymentId: s.string('The exact existing payment ID'),
    invoiceIds: nullableInvoiceIds(),
  },
} as const;

/** The names of the components in the assistant kit. */
export type AssistantKitName =
  | 'AssistantText'
  | 'LedgerTable'
  | 'TrendChart'
  | 'AgingSummary'
  | 'CustomerCard'
  | 'ReviewPayment';

/**
 * Build the kit the same way on every side. The server passes placeholder
 * objects, React passes components; both get identical descriptors, and the
 * leaf descriptors are the same objects at the top level and under
 * AssistantText, which is what keeps the two JSON schemas equal.
 */
export function createAssistantKit<C extends Record<AssistantKitName, object>>(
  components: C,
) {
  const leaves = [
    { ...ledgerTableConfig, component: components.LedgerTable },
    { ...trendChartConfig, component: components.TrendChart },
    { ...agingSummaryConfig, component: components.AgingSummary },
    { ...customerCardConfig, component: components.CustomerCard },
    { ...reviewPaymentConfig, component: components.ReviewPayment },
  ] as const;
  const text = {
    ...assistantTextConfig,
    component: components.AssistantText,
    children: [...leaves],
  };
  return [text, ...leaves] as [typeof text, ...typeof leaves];
}

/**
 * Canonical JSON response schema accepted by the invoicing server and React UI.
 *
 * The middleware compares this against the schema the client sent as JSON with
 * `isDeepStrictEqual`, and `s.nullish()` emits a `const: undefined` key that
 * JSON drops, so the canonical schema must itself be JSON-clean.
 */
export const assistantResponseSchema: Record<string, unknown> = JSON.parse(
  JSON.stringify(
    s.toJsonSchema(
      ɵcreateUiKit({
        components: createAssistantKit({
          AssistantText: {},
          LedgerTable: {},
          TrendChart: {},
          AgingSummary: {},
          CustomerCard: {},
          ReviewPayment: {},
        }),
      }).schema,
    ),
  ),
);
