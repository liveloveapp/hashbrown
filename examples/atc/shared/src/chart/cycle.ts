/** Days in one AIRAC (and NASR 28-day subscription) cycle. */
const CYCLE_DAYS = 28;
/** A known cycle start: AIRAC 2610, effective 1 October 2026 (UTC). */
const REFERENCE = Date.UTC(2026, 9, 1);
const DAY_MS = 86_400_000;
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * The AIRAC cycle in effect on `date`: its ident (YYNN), effective date and
 * the date as NASR writes it in subscription URLs (DD_Mon_YYYY). The first
 * cycle that starts in a year is numbered 01.
 */
export function currentCycle(date: Date): {
  ident: string;
  effective: string;
  nasrDate: string;
} {
  const offset = Math.floor((date.getTime() - REFERENCE) / DAY_MS / CYCLE_DAYS);
  const start = new Date(REFERENCE + offset * CYCLE_DAYS * DAY_MS);
  const year = start.getUTCFullYear();
  const dayOfYear = Math.floor(
    (start.getTime() - Date.UTC(year, 0, 1)) / DAY_MS,
  );
  const number = Math.floor(dayOfYear / CYCLE_DAYS) + 1;
  const day = pad(start.getUTCDate());

  return {
    ident: `${String(year).slice(2)}${pad(number)}`,
    effective: `${year}-${pad(start.getUTCMonth() + 1)}-${day}`,
    nasrDate: `${day}_${MONTHS[start.getUTCMonth()]}_${year}`,
  };
}
