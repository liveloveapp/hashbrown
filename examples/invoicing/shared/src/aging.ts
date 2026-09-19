/** Net terms every invoice is issued on. Overdue starts the day after. */
export const TERMS_DAYS = 30;

/** Aging buckets, in cents, for open invoices on an as-of date. */
export interface AgingBuckets {
  readonly current: number;
  readonly days1to30: number;
  readonly days31to60: number;
  readonly days61to90: number;
  readonly over90: number;
}

export const AGING_BUCKETS: readonly (keyof AgingBuckets)[] = [
  'current',
  'days1to30',
  'days31to60',
  'days61to90',
  'over90',
];

const DAY = 86_400_000;

/** Whole days from `from` to `to`, both YYYY-MM-DD. */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY,
  );
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
