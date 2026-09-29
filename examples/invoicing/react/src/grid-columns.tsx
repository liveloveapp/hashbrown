import type { PretableColumn } from '@pretable/react';
import { wholeMoney } from './ledger-views';

/** Sort currency codes with `first` on top, then alphabetically. */
export function currencyGroupOrder(first: string) {
  // Must return 0 for equal codes: Pretable uses compare for group identity too.
  return (a: string, b: string) =>
    a === b ? 0 : a === first ? -1 : b === first ? 1 : a.localeCompare(b);
}

/**
 * The hidden column the dashboard grids group by. Its `compare` puts the
 * switcher's currency group first; Pretable 0.20.2 honours `compare` at
 * runtime but leaves it off the loose `PretableColumn` type.
 */
export function currencyColumn<Row extends { readonly currency: string }>(
  first: string,
): PretableColumn<Row> {
  return {
    id: 'currency',
    header: 'Currency',
    type: 'text',
    value: (row) => row.currency,
    ...({ compare: currencyGroupOrder(first) } as object),
  };
}

/** A right-aligned whole-unit money column, summed per currency group. */
export function moneyColumn<Row extends { readonly currency: string }>(
  id: string,
  header: string,
  cents: (row: Row) => number,
): PretableColumn<Row> {
  return {
    id,
    header,
    widthPx: 110,
    type: 'number',
    value: cents,
    aggregate: 'sum',
    format: ({ row }) => wholeMoney(cents(row), row.currency),
    formatAggregate: ({ value, group }) =>
      wholeMoney(value as number, String(group.value)),
  };
}
