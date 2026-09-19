import { type ReactNode, useContext } from 'react';
import {
  AGING_BUCKETS,
  agingBucket,
  type AgingBuckets,
  createAssistantKit,
} from '@invoicing/contracts';
import { SnapshotContext } from './snapshot-context';

/** The ledger's fixed as-of date; the server's snapshot is dated the same. */
const AS_OF = '2026-09-15';

const BUCKET_LABELS: Record<keyof AgingBuckets, string> = {
  current: 'Current',
  days1to30: '1-30 days',
  days31to60: '31-60 days',
  days61to90: '61-90 days',
  over90: 'Over 90 days',
};

function money(amountCents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
    amountCents / 100,
  );
}

function monthLabel(month: string): string {
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function useSnapshot() {
  return useContext(SnapshotContext);
}

export function AssistantText({
  text,
  children,
}: {
  text: string;
  children?: ReactNode;
}) {
  if (!text) return null;
  return (
    <div className="assistant-answer">
      <p>{text}</p>
      {children}
    </div>
  );
}

export function LedgerTable({
  title,
  recordIds,
}: {
  title: string;
  recordIds: string[];
}) {
  const snapshot = useSnapshot();
  if (!snapshot) return null;
  const rows = recordIds.flatMap((id) => {
    const invoice = snapshot.invoices.find((i) => i.id === id);
    if (invoice)
      return [
        {
          id,
          reference: invoice.reference ?? id,
          customer: invoice.customerName ?? invoice.customerId,
          date: invoice.date ?? '',
          amount: money(invoice.amountCents, invoice.currency),
          balance: money(invoice.outstandingCents, invoice.currency),
        },
      ];
    const payment = snapshot.payments.find((p) => p.id === id);
    if (payment)
      return [
        {
          id,
          reference: payment.reference ?? id,
          customer: payment.customerName ?? payment.customerId,
          date: payment.date ?? '',
          amount: money(payment.amountCents, payment.currency),
          balance: money(payment.unappliedCents, payment.currency),
        },
      ];
    return [];
  });
  const missing = recordIds.length - rows.length;
  return (
    <section className="assistant-table">
      <h4>{title}</h4>
      <table>
        <thead>
          <tr>
            <th>Reference</th>
            <th>Customer</th>
            <th>Date</th>
            <th>Amount</th>
            <th>Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.reference}</td>
              <td>{row.customer}</td>
              <td>{row.date}</td>
              <td>{row.amount}</td>
              <td>{row.balance}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {missing > 0 && (
        <p role="status">
          {missing} record{missing === 1 ? '' : 's'} could not be shown.
        </p>
      )}
    </section>
  );
}

export function TrendChart({
  currency,
  customerId,
  months,
}: {
  currency: string;
  customerId: string | null;
  months: number;
}) {
  const snapshot = useSnapshot();
  if (!snapshot) return null;
  const own = <
    T extends { currency: string; customerId: string; date?: string },
  >(
    records: readonly T[],
  ) =>
    records.filter(
      (r) =>
        r.currency === currency && (!customerId || r.customerId === customerId),
    );
  const invoices = own(snapshot.invoices);
  const payments = own(snapshot.payments);
  // Calendar months back from the as-of month, zero-filled, matching the
  // server's monthlyTotals so the chart and the tool agree on which months exist.
  const [asOfYear, asOfMonth] = AS_OF.split('-').map(Number);
  const count = Math.max(1, months);
  const rows = Array.from({ length: count }, (_, offset) => {
    const index = asOfYear * 12 + (asOfMonth - 1) - (count - 1 - offset);
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
  }).map((month) => ({
    month,
    invoiced: invoices
      .filter((i) => i.date?.startsWith(month))
      .reduce((sum, i) => sum + i.amountCents, 0),
    received: payments
      .filter((p) => p.date?.startsWith(month))
      .reduce((sum, p) => sum + p.amountCents, 0),
  }));
  return (
    <section className="assistant-trend">
      <h4>
        Invoiced vs received · {currency}
        {customerId ? ` · ${customerId}` : ''}
      </h4>
      <table>
        <thead>
          <tr>
            <th>Month</th>
            <th>Invoiced</th>
            <th>Received</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.month}>
              <td>{monthLabel(row.month)}</td>
              <td>{money(row.invoiced, currency)}</td>
              <td>{money(row.received, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function AgingSummary({
  currency,
  customerId,
}: {
  currency: string;
  customerId: string | null;
}) {
  const snapshot = useSnapshot();
  if (!snapshot) return null;
  const totals: Record<keyof AgingBuckets, number> = {
    current: 0,
    days1to30: 0,
    days31to60: 0,
    days61to90: 0,
    over90: 0,
  };
  for (const invoice of snapshot.invoices) {
    if (
      invoice.currency !== currency ||
      invoice.outstandingCents <= 0 ||
      (customerId && invoice.customerId !== customerId)
    )
      continue;
    const bucket = invoice.date ? agingBucket(invoice.date, AS_OF) : 'current';
    totals[bucket] += invoice.outstandingCents;
  }
  return (
    <section className="assistant-aging">
      <h4>
        Aging · {currency}
        {customerId ? ` · ${customerId}` : ''}
      </h4>
      <dl>
        {AGING_BUCKETS.map((bucket) => (
          <div key={bucket}>
            <dt>{BUCKET_LABELS[bucket]}</dt>
            <dd>{money(totals[bucket], currency)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function CustomerCard({ customerId }: { customerId: string }) {
  const snapshot = useSnapshot();
  const customer = snapshot?.customers.find((c) => c.id === customerId);
  if (!snapshot || !customer) return null;
  const open = snapshot.invoices
    .filter((i) => i.customerId === customerId)
    .reduce((sum, i) => sum + i.outstandingCents, 0);
  const unapplied = snapshot.payments
    .filter((p) => p.customerId === customerId)
    .reduce((sum, p) => sum + p.unappliedCents, 0);
  return (
    <section className="assistant-customer">
      <h4>{customer.name}</h4>
      <p>
        {customer.currency} · pays {customer.profile}
      </p>
      <dl>
        <div>
          <dt>Open</dt>
          <dd>{money(open, customer.currency)}</dd>
        </div>
        <div>
          <dt>Unapplied</dt>
          <dd>{money(unapplied, customer.currency)}</dd>
        </div>
      </dl>
    </section>
  );
}

/** Build the kit over concrete renderers; `ReviewPayment` is supplied by the workspace, which owns the review action. */
export function assistantKit(
  ReviewPayment: (props: { paymentId: string }) => ReactNode,
) {
  return createAssistantKit({
    AssistantText,
    LedgerTable,
    TrendChart,
    AgingSummary,
    CustomerCard,
    ReviewPayment,
  });
}
