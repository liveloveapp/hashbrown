import type { ClientRow, InvoiceRow } from '@invoicing/contracts';
import { AgingSummary, TrendChart } from './assistant-charts';
import { HABITS, wholeMoney } from './ledger-views';
import { StatusDot } from './status-dot';

/** Inputs for {@link FocusBand}. */
export interface FocusBandProps {
  readonly currency: string;
  readonly client?: ClientRow;
  readonly invoice?: InvoiceRow;
  readonly onClear: () => void;
}

/**
 * The fixed-height band of charts under the KPI strip: every client in one
 * currency, or the focused client. Reads the ledger from `SnapshotContext`.
 */
export function FocusBand({
  currency,
  client,
  invoice,
  onClear,
}: FocusBandProps) {
  const customerId = client?.id ?? null;
  return (
    <section className="focus-band" aria-label="Focus">
      <header className="focus-header">
        <h2>{client ? client.name : `All ${currency} clients`}</h2>
        {client && <StatusDot {...HABITS[client.profile]} />}
        {invoice && (
          <span className="focus-record">
            {invoice.reference} ·{' '}
            {wholeMoney(invoice.balanceCents, invoice.currency)} open
          </span>
        )}
        {client && (
          <button
            type="button"
            className="focus-clear"
            aria-label="Clear focus"
            aria-keyshortcuts="Escape"
            onClick={onClear}
          >
            ✕
          </button>
        )}
      </header>
      <div
        className="band-charts"
        key={customerId ?? currency}
        data-outline-bucket={invoice?.bucket ?? undefined}
      >
        <TrendChart currency={currency} customerId={customerId} months={6} />
        <AgingSummary currency={currency} customerId={customerId} />
      </div>
    </section>
  );
}
