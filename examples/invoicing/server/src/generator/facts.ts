import type { Ledger, PaymentProfile } from '@invoicing/contracts';
import { getSnapshot } from '../ledger';
import { AS_OF } from './clients';
import { daysBetween } from './dates';

/** Net terms every invoice is issued on. Overdue starts the day after. */
export const TERMS_DAYS = 30;

export interface AgingBuckets {
  /** Not yet overdue. Undated open invoices are counted here too. */
  readonly current: number;
  readonly days1to30: number;
  readonly days31to60: number;
  readonly days61to90: number;
  readonly over90: number;
}

export interface CustomerFacts {
  readonly customerId: string;
  readonly name: string;
  readonly currency: string;
  readonly profile: PaymentProfile;
  readonly invoicedCents: number;
  readonly receivedCents: number;
  readonly openCents: number;
  readonly unappliedCents: number;
  readonly openInvoiceIds: readonly string[];
  /**
   * Mean days from invoice date to payment date over allocations. It is a
   * count-weighted mean, so an invoice settled by two allocations counts
   * twice and a batch payer looks late even when it settles on schedule.
   * Undefined when the customer has no payment history.
   */
  readonly averageDaysToPay: number | undefined;
  /**
   * Share of allocations paid after the terms elapsed, 0 to 1. Undefined,
   * like `averageDaysToPay`, when the customer has no payment history.
   */
  readonly latePaymentRate: number | undefined;
}

export interface CurrencyFacts {
  readonly currency: string;
  readonly invoicedCents: number;
  readonly receivedCents: number;
  readonly openCents: number;
  readonly unappliedCents: number;
  readonly largestOpen:
    { readonly customerId: string; readonly openCents: number } | undefined;
  readonly aging: AgingBuckets;
}

/** Everything an eval or a customer card needs, computed, never typed. */
export interface LedgerFacts {
  readonly asOf: string;
  readonly customers: readonly CustomerFacts[];
  readonly currencies: readonly CurrencyFacts[];
  /**
   * Unapplied payments with more than one open invoice to choose from,
   * including combined payments that cover several invoices.
   */
  readonly ambiguousPaymentIds: readonly string[];
}

/** Which aging bucket an open invoice falls in on `asOf`. */
export function agingBucket(
  invoiceDate: string,
  asOf: string,
): keyof AgingBuckets {
  const overdue = daysBetween(invoiceDate, asOf) - TERMS_DAYS;
  if (overdue <= 0) return 'current';
  if (overdue <= 30) return 'days1to30';
  if (overdue <= 60) return 'days31to60';
  if (overdue <= 90) return 'days61to90';
  return 'over90';
}

const sum = (values: readonly number[]) =>
  values.reduce((total, value) => total + value, 0);

/**
 * Derive ground truth from a ledger. Pure; the same ledger gives the same
 * facts. `asOf` only drives the aging buckets: totals, open balances and
 * payment lags are taken from the whole ledger, which is assumed to contain
 * nothing dated after `asOf`.
 *
 * @param ledger The ledger to describe.
 * @param asOf The date the aging buckets are measured on.
 */
export function deriveFacts(ledger: Ledger, asOf = AS_OF): LedgerFacts {
  const snapshot = getSnapshot(ledger);
  const paymentsById = new Map(snapshot.payments.map((p) => [p.id, p]));
  const invoicesById = new Map(snapshot.invoices.map((i) => [i.id, i]));
  const lagsByCustomer = new Map<string, number[]>();
  for (const allocation of ledger.allocations) {
    const payment = paymentsById.get(allocation.paymentId);
    const invoice = invoicesById.get(allocation.invoiceId);
    if (!payment?.date || !invoice?.date) continue;
    const lags = lagsByCustomer.get(invoice.customerId) ?? [];
    lags.push(daysBetween(invoice.date, payment.date));
    lagsByCustomer.set(invoice.customerId, lags);
  }

  const customers: CustomerFacts[] = ledger.customers.map((c) => {
    const invoices = snapshot.invoices.filter((i) => i.customerId === c.id);
    const payments = snapshot.payments.filter((p) => p.customerId === c.id);
    const lags = lagsByCustomer.get(c.id) ?? [];
    return {
      customerId: c.id,
      name: c.name,
      currency: c.currency,
      profile: c.profile,
      invoicedCents: sum(invoices.map((i) => i.amountCents)),
      receivedCents: sum(payments.map((p) => p.amountCents)),
      openCents: sum(invoices.map((i) => i.outstandingCents)),
      unappliedCents: sum(payments.map((p) => p.unappliedCents)),
      openInvoiceIds: invoices
        .filter((i) => i.outstandingCents > 0)
        .map((i) => i.id),
      averageDaysToPay: lags.length
        ? Math.round(sum(lags) / lags.length)
        : undefined,
      latePaymentRate: lags.length
        ? lags.filter((lag) => lag > TERMS_DAYS).length / lags.length
        : undefined,
    };
  });

  const currencies: CurrencyFacts[] = [
    ...new Set(ledger.customers.map((c) => c.currency)),
  ]
    .sort()
    .map((currency) => {
      const own = customers.filter((c) => c.currency === currency);
      const aging = {
        current: 0,
        days1to30: 0,
        days31to60: 0,
        days61to90: 0,
        over90: 0,
      };
      for (const invoice of snapshot.invoices) {
        if (invoice.currency !== currency || invoice.outstandingCents <= 0)
          continue;
        if (invoice.date)
          aging[agingBucket(invoice.date, asOf)] += invoice.outstandingCents;
        else aging.current += invoice.outstandingCents;
      }
      const largest = own
        .filter((c) => c.openCents > 0)
        .sort((a, b) => b.openCents - a.openCents)[0];
      return {
        currency,
        invoicedCents: sum(own.map((c) => c.invoicedCents)),
        receivedCents: sum(own.map((c) => c.receivedCents)),
        openCents: sum(own.map((c) => c.openCents)),
        unappliedCents: sum(own.map((c) => c.unappliedCents)),
        largestOpen: largest
          ? { customerId: largest.customerId, openCents: largest.openCents }
          : undefined,
        aging,
      };
    });

  const ambiguousPaymentIds = snapshot.payments
    .filter(
      (p) =>
        p.unappliedCents > 0 &&
        snapshot.invoices.filter(
          (i) =>
            i.customerId === p.customerId &&
            i.currency === p.currency &&
            i.outstandingCents > 0,
        ).length > 1,
    )
    .map((p) => p.id);

  return { asOf, customers, currencies, ambiguousPaymentIds };
}
