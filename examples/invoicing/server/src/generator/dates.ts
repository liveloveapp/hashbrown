export { daysBetween, monthAt } from '@invoicing/contracts';

const DAY = 86_400_000;

const parse = (date: string) => Date.parse(`${date}T00:00:00Z`);

/** `date` plus `days`, as YYYY-MM-DD. Negative days walk backwards. */
export function addDays(date: string, days: number): string {
  return new Date(parse(date) + days * DAY).toISOString().slice(0, 10);
}
