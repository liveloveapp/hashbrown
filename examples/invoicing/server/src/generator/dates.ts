const DAY = 86_400_000;

const parse = (date: string) => Date.parse(`${date}T00:00:00Z`);

/** `date` plus `days`, as YYYY-MM-DD. Negative days walk backwards. */
export function addDays(date: string, days: number): string {
  return new Date(parse(date) + days * DAY).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((parse(to) - parse(from)) / DAY);
}

/** The month `offset` months after `first`, as YYYY-MM. */
export function monthAt(first: string, offset: number): string {
  const [year, month] = first.split('-').map(Number);
  const index = year * 12 + (month - 1) + offset;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}
