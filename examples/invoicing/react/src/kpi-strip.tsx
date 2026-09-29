import type { ClientRow, CurrencyTotals } from '@invoicing/contracts';
import { SWITCHER_CURRENCIES } from './focus';
import { wholeMoney } from './ledger-views';

/** Inputs for {@link KpiStrip}. */
export interface KpiStripProps {
  readonly totals: readonly CurrencyTotals[];
  /** The currency on show: the focused client's, else the switcher's. */
  readonly currency: string;
  /** The focused client; its figures replace the portfolio's and lock the switcher. */
  readonly client?: ClientRow;
  readonly onCurrencyChange: (currency: string) => void;
}

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? '' : 's'}`;

/** Four receivables tiles and the USD/EUR/GBP switcher above the focus band. */
export function KpiStrip({
  totals,
  currency,
  client,
  onCurrencyChange,
}: KpiStripProps) {
  const total = totals.find((t) => t.currency === currency);
  const open = client?.openCents ?? total?.openCents ?? 0;
  const overdue = client?.overdueCents ?? total?.overdueCents ?? 0;
  const unapplied = client?.unappliedCents ?? total?.unappliedCents ?? 0;
  const days = client
    ? client.averageDaysToPay
    : (total?.averageDaysToPay ?? null);
  const tiles = [
    {
      label: 'Open',
      value: wholeMoney(open, currency),
      note: client
        ? plural(client.openInvoiceCount, 'open invoice')
        : plural(total?.clientCount ?? 0, 'client'),
    },
    {
      label: 'Overdue',
      value: wholeMoney(overdue, currency),
      note: open
        ? `${Math.round((overdue / open) * 100)}% of open`
        : 'Nothing open',
    },
    {
      label: 'Unapplied',
      value: wholeMoney(unapplied, currency),
      note: client
        ? 'Cash to match'
        : `${plural(total?.unappliedPaymentCount ?? 0, 'payment')} to match`,
    },
    {
      label: 'Days to pay',
      value: days === null ? '—' : String(days),
      note: 'Average, invoice to payment',
    },
  ];
  return (
    <section className="kpi-strip" aria-label="Ledger totals">
      <div className="currency-switcher" role="group" aria-label="Currency">
        {SWITCHER_CURRENCIES.map((code) => (
          <button
            key={code}
            type="button"
            aria-pressed={code === currency}
            disabled={Boolean(client) && code !== currency}
            title={client ? `Locked to ${client.name}’s currency` : undefined}
            onClick={() => onCurrencyChange(code)}
          >
            {code}
          </button>
        ))}
      </div>
      {tiles.map((tile) => (
        <article key={tile.label}>
          <span>{tile.label}</span>
          <strong>{tile.value}</strong>
          <small>{tile.note}</small>
        </article>
      ))}
    </section>
  );
}
