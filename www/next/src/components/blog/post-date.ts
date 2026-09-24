const formatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * Format a post's ISO date like Angular's `date: 'MMM d, yyyy'`
 * (e.g. `Sep 23, 2026`). Formats in UTC so the day never shifts with the
 * reader's time zone.
 *
 * @param date - ISO date, `yyyy-mm-dd`.
 */
export function formatPostDate(date: string): string {
  return formatter.format(new Date(`${date}T00:00:00Z`));
}
