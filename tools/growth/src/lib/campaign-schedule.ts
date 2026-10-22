/** The time zone every campaign date, send window and digest is computed in. */
export const CAMPAIGN_TIME_ZONE = 'America/Los_Angeles';

/** The Pacific hour (24-hour clock) of the weekday send window. */
const SEND_HOUR = 7;

const calendar = new Intl.DateTimeFormat('en-US', {
  timeZone: CAMPAIGN_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});

interface PacificParts {
  year: number;
  month: number;
  day: number;
  hour: number;
}

function parts(date: Date): PacificParts {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new Error('Invalid campaign date');
  }
  const values = Object.fromEntries(
    calendar.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(values['year']),
    month: Number(values['month']),
    day: Number(values['day']),
    hour: Number(values['hour']),
  };
}

/** UTC midnight of the Pacific calendar date, used only for date arithmetic. */
function calendarDay(local: PacificParts): Date {
  return new Date(Date.UTC(local.year, local.month - 1, local.day));
}

function isWeekday(day: Date): boolean {
  return day.getUTCDay() !== 0 && day.getUTCDay() !== 6;
}

/** 07:00 Pacific on the calendar date `day` (a UTC-midnight date). */
function sendMorningOf(day: Date): Date {
  // 15:00 UTC is 07:00 or 08:00 Pacific. Resolve the target date's own
  // offset, not an anchor's, so crossing DST preserves the local hour.
  const morning = new Date(day.getTime());
  morning.setUTCHours(15);
  morning.setUTCHours(morning.getUTCHours() + SEND_HOUR - parts(morning).hour);
  return morning;
}

/**
 * 07:00 Pacific on the `businessDays`-th weekday after the anchor's Pacific
 * calendar date. The anchor date itself never counts, weekends are skipped and
 * holidays are not.
 *
 * @param anchor - The instant to count from.
 * @param businessDays - An integer from 1 to 366.
 * @throws When the anchor is not a valid date or the offset is out of range.
 */
export function businessMorningAfter(anchor: Date, businessDays: number): Date {
  if (
    !Number.isSafeInteger(businessDays) ||
    businessDays < 1 ||
    businessDays > 366
  ) {
    throw new Error('Invalid business-day offset');
  }
  const day = calendarDay(parts(anchor));
  let remaining = businessDays;
  while (remaining > 0) {
    day.setUTCDate(day.getUTCDate() + 1);
    if (isWeekday(day)) remaining -= 1;
  }
  return sendMorningOf(day);
}

/**
 * Whether `now` is inside the campaign send window: Monday to Friday, from
 * 07:00:00.000 to 07:59:59.999 Pacific.
 *
 * @throws When `now` is not a valid date.
 */
export function isCampaignSendWindow(now: Date): boolean {
  const local = parts(now);
  return isWeekday(calendarDay(local)) && local.hour === SEND_HOUR;
}

/**
 * The Pacific calendar date of `now` as `YYYY-MM-DD`, and whether it is
 * Monday to Friday.
 *
 * @throws When `now` is not a valid date.
 */
export function pacificCalendarDate(now: Date): {
  date: string;
  weekday: boolean;
} {
  const local = parts(now);
  const pad = (value: number) => String(value).padStart(2, '0');
  return {
    date: `${local.year}-${pad(local.month)}-${pad(local.day)}`,
    weekday: isWeekday(calendarDay(local)),
  };
}

/**
 * The next 07:00 Pacific business morning at or after `now`: today at 07:00
 * when `now` is a weekday before 07:00 Pacific, otherwise
 * `businessMorningAfter(now, 1)`. Never a Saturday or Sunday.
 *
 * @throws When `now` is not a valid date.
 */
export function nextPacificBusinessMorning(now: Date): Date {
  const local = parts(now);
  const today = calendarDay(local);
  if (isWeekday(today) && local.hour < SEND_HOUR) return sendMorningOf(today);
  return businessMorningAfter(now, 1);
}
