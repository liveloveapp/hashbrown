import {
  AGING_BUCKETS,
  agingBucket,
  type AgingBuckets,
  type LedgerSnapshot,
  type PaymentProfile,
} from '@invoicing/contracts';
import { AS_OF } from './generator/clients';
import { deriveFacts } from './generator/facts';
import { formatMoney } from './money';

/** Row caps keep one tool result near 3K tokens. */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const DEFAULT_MONTHS = 12;
const MAX_MONTHS = 24;

type Snapshot = LedgerSnapshot;
type Invoice = Snapshot['invoices'][number];
type Payment = Snapshot['payments'][number];

const sum = (values: readonly number[]) =>
  values.reduce((total, value) => total + value, 0);
const byDateDesc = <T extends { readonly date?: string }>(a: T, b: T) =>
  (b.date ?? '').localeCompare(a.date ?? '');

function requireCustomer(snapshot: Snapshot, customerId: string) {
  const customer = snapshot.customers.find((c) => c.id === customerId);
  if (!customer) throw new Error('customer_not_found');
  return customer;
}

function requireCurrency(snapshot: Snapshot, currency: string) {
  if (!snapshot.customers.some((c) => c.currency === currency))
    throw new Error('currency_not_found');
  return currency;
}

const invoiceRow = (i: Invoice) => ({
  id: i.id,
  reference: i.reference ?? i.id,
  date: i.date ?? '',
  amountCents: i.amountCents,
  amount: formatMoney(i.amountCents, i.currency),
  outstandingCents: i.outstandingCents,
  outstanding: formatMoney(i.outstandingCents, i.currency),
});

const paymentRow = (p: Payment) => ({
  id: p.id,
  reference: p.reference ?? p.id,
  date: p.date ?? '',
  amountCents: p.amountCents,
  amount: formatMoney(p.amountCents, p.currency),
  unappliedCents: p.unappliedCents,
  unapplied: formatMoney(p.unappliedCents, p.currency),
});

/** Start here: per-currency totals and the customer list. */
export function ledgerSummary(snapshot: Snapshot) {
  const currencies = [...new Set(snapshot.customers.map((c) => c.currency))]
    .sort()
    .map((currency) => {
      const invoices = snapshot.invoices.filter((i) => i.currency === currency);
      const payments = snapshot.payments.filter((p) => p.currency === currency);
      const invoicedCents = sum(invoices.map((i) => i.amountCents));
      const receivedCents = sum(payments.map((p) => p.amountCents));
      const openCents = sum(invoices.map((i) => i.outstandingCents));
      const unappliedCents = sum(payments.map((p) => p.unappliedCents));
      return {
        currency,
        invoicedCents,
        invoiced: formatMoney(invoicedCents, currency),
        receivedCents,
        received: formatMoney(receivedCents, currency),
        openCents,
        open: formatMoney(openCents, currency),
        unappliedCents,
        unapplied: formatMoney(unappliedCents, currency),
        openInvoices: invoices.filter((i) => i.outstandingCents > 0).length,
        unappliedPayments: payments.filter((p) => p.unappliedCents > 0).length,
      };
    });
  return {
    asOf: AS_OF,
    currencies,
    customers: snapshot.customers.map(({ id, name, currency, profile }) => ({
      id,
      name,
      currency,
      profile,
    })),
  };
}

/** Invoiced versus received per month for one currency, optionally one customer. */
export function monthlyTotals(
  snapshot: Snapshot,
  input: {
    readonly currency: string;
    readonly customerId?: string;
    readonly months?: number;
  },
) {
  const currency = requireCurrency(snapshot, input.currency);
  if (input.customerId) requireCustomer(snapshot, input.customerId);
  const months = Math.min(
    MAX_MONTHS,
    Math.max(1, Math.floor(input.months ?? DEFAULT_MONTHS)),
  );
  const own = <T extends Invoice | Payment>(records: readonly T[]) =>
    records.filter(
      (r) =>
        r.currency === currency &&
        (!input.customerId || r.customerId === input.customerId),
    );
  const invoices = own(snapshot.invoices);
  const payments = own(snapshot.payments);
  const allMonths = [
    ...new Set(
      [...invoices, ...payments].flatMap((r) =>
        r.date ? [r.date.slice(0, 7)] : [],
      ),
    ),
  ].sort();
  const rows = allMonths.slice(-months).map((month) => {
    const invoicedCents = sum(
      invoices
        .filter((i) => i.date?.startsWith(month))
        .map((i) => i.amountCents),
    );
    const receivedCents = sum(
      payments
        .filter((p) => p.date?.startsWith(month))
        .map((p) => p.amountCents),
    );
    return {
      month,
      invoicedCents,
      invoiced: formatMoney(invoicedCents, currency),
      receivedCents,
      received: formatMoney(receivedCents, currency),
    };
  });
  return { currency, customerId: input.customerId ?? null, rows };
}

/** Open balance by aging bucket, with the invoice IDs in each. */
export function aging(
  snapshot: Snapshot,
  input: { readonly currency: string; readonly customerId?: string },
) {
  const currency = requireCurrency(snapshot, input.currency);
  if (input.customerId) requireCustomer(snapshot, input.customerId);
  const open = snapshot.invoices.filter(
    (i) =>
      i.currency === currency &&
      i.outstandingCents > 0 &&
      (!input.customerId || i.customerId === input.customerId),
  );
  const cents: Record<keyof AgingBuckets, number> = {
    current: 0,
    days1to30: 0,
    days31to60: 0,
    days61to90: 0,
    over90: 0,
  };
  const ids: Record<keyof AgingBuckets, string[]> = {
    current: [],
    days1to30: [],
    days31to60: [],
    days61to90: [],
    over90: [],
  };
  for (const invoice of open) {
    const bucket = invoice.date ? agingBucket(invoice.date, AS_OF) : 'current';
    cents[bucket] += invoice.outstandingCents;
    ids[bucket].push(invoice.id);
  }
  return {
    currency,
    customerId: input.customerId ?? null,
    asOf: AS_OF,
    buckets: AGING_BUCKETS.map((bucket) => ({
      bucket,
      cents: cents[bucket],
      formatted: formatMoney(cents[bucket], currency),
      invoiceIds: ids[bucket],
    })),
  };
}

/** One client's habit, balances, and open items (capped). */
export function customerStatement(
  snapshot: Snapshot,
  input: { readonly customerId: string },
) {
  const customer = requireCustomer(snapshot, input.customerId);
  const facts = deriveFacts(snapshot).customers.find(
    (c) => c.customerId === customer.id,
  );
  if (!facts) throw new Error('customer_not_found');
  const openInvoices = snapshot.invoices
    .filter((i) => i.customerId === customer.id && i.outstandingCents > 0)
    .sort(byDateDesc);
  const unapplied = snapshot.payments
    .filter((p) => p.customerId === customer.id && p.unappliedCents > 0)
    .sort(byDateDesc);
  const lastPayment = snapshot.payments
    .filter((p) => p.customerId === customer.id)
    .sort(byDateDesc)[0];
  return {
    customer: {
      id: customer.id,
      name: customer.name,
      currency: customer.currency,
      profile: customer.profile as PaymentProfile,
    },
    invoicedCents: facts.invoicedCents,
    invoiced: formatMoney(facts.invoicedCents, customer.currency),
    receivedCents: facts.receivedCents,
    received: formatMoney(facts.receivedCents, customer.currency),
    openCents: facts.openCents,
    open: formatMoney(facts.openCents, customer.currency),
    unappliedCents: facts.unappliedCents,
    unapplied: formatMoney(facts.unappliedCents, customer.currency),
    averageDaysToPay: facts.averageDaysToPay ?? null,
    latePaymentRate: facts.latePaymentRate ?? null,
    lastPaymentDate: lastPayment?.date ?? null,
    openInvoiceCount: openInvoices.length,
    openInvoicesTruncated: openInvoices.length > MAX_LIMIT,
    openInvoices: openInvoices.slice(0, MAX_LIMIT).map(invoiceRow),
    unappliedPayments: unapplied.map(paymentRow),
  };
}

/**
 * Search invoices and payments; returns IDs the model can pass to LedgerTable.
 * Rows carry the customer ID but not the name or description (the summary
 * maps IDs to names and the table shows descriptions) so fifty fit the budget.
 */
export function findRecords(
  snapshot: Snapshot,
  input: {
    readonly kind?: 'invoice' | 'payment';
    readonly customerId?: string;
    readonly currency?: string;
    readonly status?: 'open' | 'settled';
    readonly text?: string;
    readonly from?: string;
    readonly to?: string;
    readonly limit?: number;
  },
) {
  if (input.customerId) requireCustomer(snapshot, input.customerId);
  if (input.currency) requireCurrency(snapshot, input.currency);
  const needle = input.text?.trim().toLowerCase();
  const matches = <T extends Invoice | Payment>(r: T, balance: number) =>
    (!input.customerId || r.customerId === input.customerId) &&
    (!input.currency || r.currency === input.currency) &&
    (!input.status ||
      (input.status === 'open' ? balance > 0 : balance === 0)) &&
    (!input.from || (r.date ?? '') >= input.from) &&
    (!input.to || (r.date ?? '') <= input.to) &&
    (!needle ||
      [r.reference, r.description, r.customerName, r.id].some((field) =>
        field?.toLowerCase().includes(needle),
      ));
  const invoices =
    input.kind === 'payment'
      ? []
      : snapshot.invoices
          .filter((i) => matches(i, i.outstandingCents))
          .map((i) => ({
            kind: 'invoice' as const,
            id: i.id,
            customerId: i.customerId,
            reference: i.reference ?? i.id,
            date: i.date ?? '',
            amountCents: i.amountCents,
            amount: formatMoney(i.amountCents, i.currency),
            balanceCents: i.outstandingCents,
            balance: formatMoney(i.outstandingCents, i.currency),
          }));
  const payments =
    input.kind === 'invoice'
      ? []
      : snapshot.payments
          .filter((p) => matches(p, p.unappliedCents))
          .map((p) => ({
            kind: 'payment' as const,
            id: p.id,
            customerId: p.customerId,
            reference: p.reference ?? p.id,
            date: p.date ?? '',
            amountCents: p.amountCents,
            amount: formatMoney(p.amountCents, p.currency),
            balanceCents: p.unappliedCents,
            balance: formatMoney(p.unappliedCents, p.currency),
          }));
  const all = [...invoices, ...payments].sort(byDateDesc);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Math.floor(input.limit ?? DEFAULT_LIMIT)),
  );
  return { total: all.length, records: all.slice(0, limit) };
}

/** The cash-application inbox: every unapplied payment with its candidate invoices. */
export function unappliedPayments(
  snapshot: Snapshot,
  input: { readonly currency?: string },
) {
  if (input.currency) requireCurrency(snapshot, input.currency);
  const payments = snapshot.payments
    .filter(
      (p) =>
        p.unappliedCents > 0 &&
        (!input.currency || p.currency === input.currency),
    )
    .sort(byDateDesc)
    .map((p) => ({
      ...paymentRow(p),
      customerId: p.customerId,
      customerName: p.customerName ?? p.customerId,
      currency: p.currency,
      candidates: snapshot.invoices
        .filter(
          (i) =>
            i.customerId === p.customerId &&
            i.currency === p.currency &&
            i.outstandingCents > 0,
        )
        .map((i) => ({
          invoiceId: i.id,
          reference: i.reference ?? i.id,
          outstandingCents: i.outstandingCents,
          outstanding: formatMoney(i.outstandingCents, i.currency),
        })),
    }));
  const totals = [...new Set(payments.map((p) => p.currency))]
    .sort()
    .map((currency) => {
      const unappliedCents = sum(
        payments
          .filter((p) => p.currency === currency)
          .map((p) => p.unappliedCents),
      );
      return {
        currency,
        unappliedCents,
        unapplied: formatMoney(unappliedCents, currency),
      };
    });
  return { payments, totals };
}
