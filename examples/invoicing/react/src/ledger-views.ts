import {
  AGING_BUCKETS,
  agingBucket,
  type AgingBuckets,
  daysBetween,
  type LedgerSnapshot,
  monthAt,
  type PaymentProfile,
  type Proposal,
  TERMS_DAYS,
} from '@invoicing/contracts';

/** The ledger's fixed as-of date; the server's snapshot is dated the same. */
export const AS_OF = '2026-09-15';

export const BUCKET_LABELS: Record<keyof AgingBuckets, string> = {
  current: 'Current',
  days1to30: '1-30 days',
  days31to60: '31-60 days',
  days61to90: '61-90 days',
  over90: 'Over 90 days',
};

export function money(amountCents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
    amountCents / 100,
  );
}

export function monthLabel(month: string): string {
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export interface LedgerRow {
  readonly id: string;
  readonly kind: 'invoice' | 'payment';
  readonly reference: string;
  readonly customer: string;
  readonly date: string;
  readonly currency: string;
  readonly amountCents: number;
  readonly balanceCents: number;
}

/** Resolve model-chosen ids against the snapshot; duplicates collapse, unknown ids are counted. */
export function resolveRecords(
  snapshot: LedgerSnapshot,
  recordIds: readonly string[],
): { rows: LedgerRow[]; missing: number } {
  const ids = [...new Set(recordIds)];
  const rows = ids.flatMap((id): LedgerRow[] => {
    const invoice = snapshot.invoices.find((i) => i.id === id);
    if (invoice)
      return [
        {
          id,
          kind: 'invoice',
          reference: invoice.reference ?? id,
          customer: invoice.customerName ?? invoice.customerId,
          date: invoice.date ?? '',
          currency: invoice.currency,
          amountCents: invoice.amountCents,
          balanceCents: invoice.outstandingCents,
        },
      ];
    const payment = snapshot.payments.find((p) => p.id === id);
    if (payment)
      return [
        {
          id,
          kind: 'payment',
          reference: payment.reference ?? id,
          customer: payment.customerName ?? payment.customerId,
          date: payment.date ?? '',
          currency: payment.currency,
          amountCents: payment.amountCents,
          balanceCents: payment.unappliedCents,
        },
      ];
    return [];
  });
  return { rows, missing: ids.length - rows.length };
}

export interface MonthRow {
  readonly month: string;
  readonly invoicedCents: number;
  readonly receivedCents: number;
}

/** N calendar months ending at the as-of month, zero-filled; capped at 24. */
export function monthlySeries(
  snapshot: LedgerSnapshot,
  input: {
    currency: string;
    customerId: string | null;
    months: number;
    asOf: string;
  },
): MonthRow[] {
  const own = <
    T extends { currency: string; customerId: string; date?: string },
  >(
    records: readonly T[],
  ) =>
    records.filter(
      (r) =>
        r.currency === input.currency &&
        (!input.customerId || r.customerId === input.customerId),
    );
  const invoices = own(snapshot.invoices);
  const payments = own(snapshot.payments);
  const count = Math.min(24, Math.max(1, Math.floor(input.months) || 1));
  const asOfMonth = input.asOf.slice(0, 7);
  return Array.from({ length: count }, (_, offset) => {
    const key = monthAt(asOfMonth, offset - (count - 1));
    return {
      month: key,
      invoicedCents: invoices
        .filter((i) => i.date?.startsWith(key))
        .reduce((sum, i) => sum + i.amountCents, 0),
      receivedCents: payments
        .filter((p) => p.date?.startsWith(key))
        .reduce((sum, p) => sum + p.amountCents, 0),
    };
  });
}

export interface AgingRow {
  readonly bucket: keyof AgingBuckets;
  readonly label: string;
  readonly cents: number;
  readonly count: number;
}

/** Open invoices grouped into the five aging buckets, in order. */
export function agingTotals(
  snapshot: LedgerSnapshot,
  input: { currency: string; customerId: string | null; asOf: string },
): AgingRow[] {
  const totals = Object.fromEntries(
    AGING_BUCKETS.map((b) => [b, { cents: 0, count: 0 }]),
  ) as Record<keyof AgingBuckets, { cents: number; count: number }>;
  for (const invoice of snapshot.invoices) {
    if (
      invoice.currency !== input.currency ||
      invoice.outstandingCents <= 0 ||
      (input.customerId && invoice.customerId !== input.customerId)
    )
      continue;
    const bucket = invoice.date
      ? agingBucket(invoice.date, input.asOf)
      : 'current';
    totals[bucket].cents += invoice.outstandingCents;
    totals[bucket].count += 1;
  }
  return AGING_BUCKETS.map((bucket) => ({
    bucket,
    label: BUCKET_LABELS[bucket],
    ...totals[bucket],
  }));
}

export interface CustomerSummary {
  readonly id: string;
  readonly name: string;
  readonly currency: string;
  readonly profile: PaymentProfile;
  readonly invoicedCents: number;
  readonly receivedCents: number;
  readonly openCents: number;
  readonly unappliedCents: number;
  readonly openInvoiceCount: number;
  readonly averageDaysToPay: number | null;
  readonly latePaymentRate: number | null;
  readonly lastPaymentDate: string | null;
}

/** One client's balances and habit, computed from the snapshot's own allocations. */
export function customerSummary(
  snapshot: LedgerSnapshot,
  customerId: string,
): CustomerSummary | undefined {
  const customer = snapshot.customers.find((c) => c.id === customerId);
  if (!customer) return undefined;
  const invoices = snapshot.invoices.filter((i) => i.customerId === customerId);
  const payments = snapshot.payments.filter((p) => p.customerId === customerId);
  const byId = <T extends { id: string }>(records: readonly T[]) =>
    new Map(records.map((r) => [r.id, r]));
  const invoiceById = byId(invoices);
  const paymentById = byId(payments);
  const lags = snapshot.allocations.flatMap((a) => {
    const invoice = invoiceById.get(a.invoiceId);
    const payment = paymentById.get(a.paymentId);
    return invoice?.date && payment?.date
      ? [daysBetween(invoice.date, payment.date)]
      : [];
  });
  const sum = (values: readonly number[]) => values.reduce((s, v) => s + v, 0);
  const lastPayment = [...payments].sort((a, b) =>
    (b.date ?? '').localeCompare(a.date ?? ''),
  )[0];
  return {
    id: customer.id,
    name: customer.name,
    currency: customer.currency,
    profile: customer.profile,
    invoicedCents: sum(invoices.map((i) => i.amountCents)),
    receivedCents: sum(payments.map((p) => p.amountCents)),
    openCents: sum(invoices.map((i) => i.outstandingCents)),
    unappliedCents: sum(payments.map((p) => p.unappliedCents)),
    openInvoiceCount: invoices.filter((i) => i.outstandingCents > 0).length,
    averageDaysToPay: lags.length ? Math.round(sum(lags) / lags.length) : null,
    latePaymentRate: lags.length
      ? lags.filter((lag) => lag > TERMS_DAYS).length / lags.length
      : null,
    lastPaymentDate: lastPayment?.date ?? null,
  };
}

/** Join labels the way a sentence would: "a", "a and b", "a, b and c". */
export function listJoin(items: readonly string[]): string {
  return items.length < 2
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * What an applied proposal did, in words, read from the refreshed ledger.
 * Invoices are named by reference, never by internal ID.
 */
export function appliedSummary(
  snapshot: LedgerSnapshot,
  proposal: Proposal,
): string {
  const reference = (invoiceId: string) =>
    snapshot.invoices.find((i) => i.id === invoiceId)?.reference;
  const total = money(proposal.amountCents, proposal.currency);
  const target =
    proposal.lines.length === 1
      ? (reference(proposal.lines[0].invoiceId) ?? 'the invoice')
      : listJoin(
          proposal.lines.map(
            (line) =>
              `${reference(line.invoiceId) ?? 'an invoice'} (${money(line.amountCents, proposal.currency)})`,
          ),
        );
  const applied = `Applied ${total} to ${target}.`;
  const payment = snapshot.payments.find((p) => p.id === proposal.paymentId);
  if (!payment) return applied;
  return payment.unappliedCents > 0
    ? `${applied} ${money(payment.unappliedCents, payment.currency)} of this payment is still unapplied.`
    : `${applied} This payment is fully matched.`;
}
