import {
  AGING_BUCKETS,
  agingBucket,
  type AgingBuckets,
  daysBetween,
  TERMS_DAYS,
} from './aging';
import type { LedgerSnapshot, PaymentProfile } from './index';

type Invoice = LedgerSnapshot['invoices'][number];

/** How an invoice was billed, read from its description. */
export type InvoiceType = 'Retainer' | 'Milestone' | 'One-off';

/** Where an invoice stands on an as-of date; `days` counts days past its terms. */
export type InvoiceStatus =
  | { readonly kind: 'paid' }
  | { readonly kind: 'current' }
  | { readonly kind: 'overdue'; readonly days: number }
  | { readonly kind: 'partly-paid'; readonly days: number };

/** One currency's receivables, for the KPI strip and the band's portfolio state. */
export interface CurrencyTotals {
  readonly currency: string;
  readonly clientCount: number;
  readonly openCents: number;
  readonly overdueCents: number;
  readonly unappliedCents: number;
  /** Payments in this currency with cash still to match. */
  readonly unappliedPaymentCount: number;
  /** Mean days from invoice to payment over this currency's allocations, rounded; null with none. */
  readonly averageDaysToPay: number | null;
}

/** One row of the Clients grid. */
export interface ClientRow {
  readonly id: string;
  readonly name: string;
  readonly currency: string;
  readonly profile: PaymentProfile;
  readonly openCents: number;
  readonly overdueCents: number;
  readonly aging: AgingBuckets;
  readonly openInvoiceCount: number;
  readonly averageDaysToPay: number | null;
  readonly unappliedCents: number;
}

/** One row of the Invoices grid. */
export interface InvoiceRow {
  readonly id: string;
  readonly reference: string;
  readonly clientId: string;
  readonly clientName: string;
  readonly currency: string;
  readonly type: InvoiceType;
  readonly issued: string;
  readonly amountCents: number;
  readonly balanceCents: number;
  readonly daysOverdue: number;
  /** The open balance's age bucket; null once paid. */
  readonly bucket: keyof AgingBuckets | null;
  readonly status: InvoiceStatus;
}

/**
 * Classify an invoice by its description: "monthly retainer" and "project
 * milestone" are the generator's two recurring kinds; anything else, such as
 * Cedar Health's accessibility sprint, is a one-off.
 */
export function invoiceType(description: string | undefined): InvoiceType {
  if (description && /monthly retainer/i.test(description)) return 'Retainer';
  if (description && /project milestone/i.test(description)) return 'Milestone';
  return 'One-off';
}

/** Days past the invoice's terms on `asOf`; zero while current or undated. */
export function daysOverdue(invoice: Invoice, asOf: string): number {
  return invoice.date
    ? Math.max(0, daysBetween(invoice.date, asOf) - TERMS_DAYS)
    : 0;
}

/** Paid, current, overdue by n days, or partly paid and n days past terms. */
export function invoiceStatus(invoice: Invoice, asOf: string): InvoiceStatus {
  if (invoice.outstandingCents === 0) return { kind: 'paid' };
  const days = daysOverdue(invoice, asOf);
  if (invoice.outstandingCents < invoice.amountCents)
    return { kind: 'partly-paid', days };
  return days > 0 ? { kind: 'overdue', days } : { kind: 'current' };
}

const sum = (values: readonly number[]) =>
  values.reduce((total, value) => total + value, 0);

const emptyAging = (): Record<keyof AgingBuckets, number> =>
  Object.fromEntries(AGING_BUCKETS.map((bucket) => [bucket, 0])) as Record<
    keyof AgingBuckets,
    number
  >;

/** Days from each invoice's issue to the payment allocated to it, for invoices matching `include`. */
function paymentLags(
  snapshot: LedgerSnapshot,
  include: (invoice: Invoice) => boolean,
): number[] {
  const invoices = new Map(snapshot.invoices.map((i) => [i.id, i]));
  const payments = new Map(snapshot.payments.map((p) => [p.id, p]));
  return snapshot.allocations.flatMap((allocation) => {
    const invoice = invoices.get(allocation.invoiceId);
    const payment = payments.get(allocation.paymentId);
    return invoice?.date && payment?.date && include(invoice)
      ? [daysBetween(invoice.date, payment.date)]
      : [];
  });
}

const average = (values: readonly number[]) =>
  values.length ? Math.round(sum(values) / values.length) : null;

/**
 * Per-currency receivables, in the order currencies first appear among
 * customers, then invoices, then payments (records can name a currency no
 * customer bills in, as in small test ledgers).
 */
export function currencyTotals(
  snapshot: LedgerSnapshot,
  asOf: string,
): CurrencyTotals[] {
  const currencies = [
    ...new Set(
      [...snapshot.customers, ...snapshot.invoices, ...snapshot.payments].map(
        (record) => record.currency,
      ),
    ),
  ];
  return currencies.map((currency) => {
    const open = snapshot.invoices.filter(
      (i) => i.currency === currency && i.outstandingCents > 0,
    );
    return {
      currency,
      clientCount: snapshot.customers.filter((c) => c.currency === currency)
        .length,
      openCents: sum(open.map((i) => i.outstandingCents)),
      overdueCents: sum(
        open
          .filter((i) => daysOverdue(i, asOf) > 0)
          .map((i) => i.outstandingCents),
      ),
      unappliedCents: sum(
        snapshot.payments
          .filter((p) => p.currency === currency)
          .map((p) => p.unappliedCents),
      ),
      unappliedPaymentCount: snapshot.payments.filter(
        (p) => p.currency === currency && p.unappliedCents > 0,
      ).length,
      averageDaysToPay: average(
        paymentLags(snapshot, (i) => i.currency === currency),
      ),
    };
  });
}

/** Every client's balances, aging, open-invoice count and payment habit. */
export function clientRows(
  snapshot: LedgerSnapshot,
  asOf: string,
): ClientRow[] {
  return snapshot.customers.map((customer) => {
    const open = snapshot.invoices.filter(
      (i) => i.customerId === customer.id && i.outstandingCents > 0,
    );
    const aging = emptyAging();
    for (const invoice of open) {
      const bucket = invoice.date ? agingBucket(invoice.date, asOf) : 'current';
      aging[bucket] += invoice.outstandingCents;
    }
    return {
      id: customer.id,
      name: customer.name,
      currency: customer.currency,
      profile: customer.profile,
      openCents: sum(open.map((i) => i.outstandingCents)),
      overdueCents: sum(
        open
          .filter((i) => daysOverdue(i, asOf) > 0)
          .map((i) => i.outstandingCents),
      ),
      aging,
      openInvoiceCount: open.length,
      averageDaysToPay: average(
        paymentLags(snapshot, (i) => i.customerId === customer.id),
      ),
      unappliedCents: sum(
        snapshot.payments
          .filter((p) => p.customerId === customer.id)
          .map((p) => p.unappliedCents),
      ),
    };
  });
}

/** Every invoice with its type, status and age bucket, for the Invoices grid. */
export function invoiceRows(
  snapshot: LedgerSnapshot,
  asOf: string,
): InvoiceRow[] {
  const names = new Map(snapshot.customers.map((c) => [c.id, c.name]));
  return snapshot.invoices.map((invoice) => ({
    id: invoice.id,
    reference: invoice.reference ?? invoice.id,
    clientId: invoice.customerId,
    clientName:
      invoice.customerName ??
      names.get(invoice.customerId) ??
      invoice.customerId,
    currency: invoice.currency,
    type: invoiceType(invoice.description),
    issued: invoice.date ?? '',
    amountCents: invoice.amountCents,
    balanceCents: invoice.outstandingCents,
    daysOverdue: daysOverdue(invoice, asOf),
    bucket:
      invoice.outstandingCents === 0
        ? null
        : invoice.date
          ? agingBucket(invoice.date, asOf)
          : 'current',
    status: invoiceStatus(invoice, asOf),
  }));
}
