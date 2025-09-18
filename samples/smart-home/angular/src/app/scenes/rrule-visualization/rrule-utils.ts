import { ParsedRRule, ParsedSchedule } from './rrule-types';

export interface RRuleDetailSection {
  title: string;
  items: string[];
}

interface ParsedRRuleDay {
  raw: string;
  dayCode: string;
  offset?: number;
}

interface RRuleDateParts {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
  hasTime: boolean;
  tzId?: string;
  isUtc?: boolean;
}

const DAY_NAMES: Record<string, string> = {
  MO: 'Monday',
  TU: 'Tuesday',
  WE: 'Wednesday',
  TH: 'Thursday',
  FR: 'Friday',
  SA: 'Saturday',
  SU: 'Sunday',
};

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const FREQUENCY_UNITS: Record<ParsedRRule['freq'], string> = {
  SECONDLY: 'second',
  MINUTELY: 'minute',
  HOURLY: 'hour',
  DAILY: 'day',
  WEEKLY: 'week',
  MONTHLY: 'month',
  YEARLY: 'year',
};

const FREQUENCY_LABELS: Record<ParsedRRule['freq'], string> = {
  SECONDLY: 'Secondly',
  MINUTELY: 'Minutely',
  HOURLY: 'Hourly',
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  YEARLY: 'Yearly',
};

function isPresent<TValue>(value: TValue | null | undefined): value is TValue {
  return value !== null && value !== undefined;
}

function unique<TValue>(values: TValue[]): TValue[] {
  return Array.from(new Set(values));
}

function ordinalNumber(value: number): string {
  const absValue = Math.abs(value);
  const mod100 = absValue % 100;
  const mod10 = absValue % 10;
  let suffix = 'th';

  if (mod100 < 11 || mod100 > 13) {
    if (mod10 === 1) suffix = 'st';
    else if (mod10 === 2) suffix = 'nd';
    else if (mod10 === 3) suffix = 'rd';
  }

  return `${value}${suffix}`;
}

function ordinalWord(value: number): string {
  if (value === -1) return 'last';
  if (value === 1) return 'first';
  if (value === 2) return 'second';
  if (value === 3) return 'third';
  if (value === 4) return 'fourth';
  if (value === 5) return 'fifth';

  if (value < -1) {
    return `${ordinalNumber(Math.abs(value))} from the end`;
  }

  return `${ordinalNumber(value)}`;
}

function formatList(values: string[]): string {
  if (!values.length) return '';
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;

  const rest = values.slice(0, -1);
  const last = values[values.length - 1];

  return `${rest.join(', ')}, and ${last}`;
}

function parseByDayValue(value: string): ParsedRRuleDay | null {
  const match = value.match(/^(-?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/);

  if (!match) {
    return null;
  }

  const [, offset, dayCode] = match;

  return {
    raw: value,
    dayCode,
    offset: offset ? Number.parseInt(offset, 10) : undefined,
  };
}

function formatPositionDay(position: number, dayCode: string): string {
  const dayName = DAY_NAMES[dayCode] ?? dayCode;
  const word = ordinalWord(position);

  if (word.includes('from the end')) {
    return `${dayName} (${word})`;
  }

  if (word === 'last') {
    return `the last ${dayName}`;
  }

  if (/^\d/.test(word)) {
    return `${word} ${dayName}`;
  }

  return `the ${word} ${dayName}`;
}

function buildDayDescriptions(rrule: ParsedRRule): string[] {
  const rawDays = (rrule.byday ?? []).filter(isPresent);
  if (!rawDays.length) return [];

  const parsedDays = rawDays
    .map(parseByDayValue)
    .filter((value): value is ParsedRRuleDay => value !== null);

  if (!parsedDays.length) {
    return rawDays.map((day) => DAY_NAMES[day] ?? day);
  }

  const explicitOffsets = parsedDays.filter((day) => day.offset !== undefined);

  if (explicitOffsets.length) {
    return explicitOffsets.map((day) =>
      formatPositionDay(day.offset!, day.dayCode),
    );
  }

  const setPositions = (rrule.bysetpos ?? []).filter(isPresent);

  if (setPositions.length) {
    const descriptions: string[] = [];

    for (const position of setPositions) {
      for (const day of parsedDays) {
        descriptions.push(formatPositionDay(position, day.dayCode));
      }
    }

    return descriptions;
  }

  const dayNames = parsedDays.map(
    (day) => DAY_NAMES[day.dayCode] ?? day.dayCode,
  );
  return dayNames.map((name) => (name.endsWith('s') ? name : `${name}`));
}

function buildMonthDescriptions(rrule: ParsedRRule): string[] {
  const months = (rrule.bymonth ?? []).filter(isPresent);
  return months
    .map((month) => MONTH_NAMES[month - 1] ?? `Month ${month}`)
    .filter(isPresent);
}

function buildMonthDayDescriptions(rrule: ParsedRRule): string[] {
  const monthDays = (rrule.bymonthday ?? []).filter(isPresent);
  return monthDays.map((day) => ordinalNumber(day));
}

function buildYearDayDescriptions(rrule: ParsedRRule): string[] {
  const yearDays = (rrule.byyearday ?? []).filter(isPresent);
  return yearDays.map((day) => `Day ${ordinalNumber(day)}`);
}

function buildWeekNumberDescriptions(rrule: ParsedRRule): string[] {
  const weekNumbers = (rrule.byweekno ?? []).filter(isPresent);
  return weekNumbers.map((week) => `Week ${ordinalNumber(week)}`);
}

function buildSetPositionDescriptions(rrule: ParsedRRule): string[] {
  const positions = (rrule.bysetpos ?? []).filter(isPresent);
  return positions.map((position) => ordinalWord(position));
}

function buildSecondDescriptions(rrule: ParsedRRule): string[] {
  const seconds = (rrule.bysecond ?? []).filter(isPresent);
  return seconds.map(
    (second) => `Second ${second.toString().padStart(2, '0')}`,
  );
}

function buildMinuteDescriptions(rrule: ParsedRRule): string[] {
  const minutes = (rrule.byminute ?? []).filter(isPresent);
  return minutes.map(
    (minute) => `Minute ${minute.toString().padStart(2, '0')}`,
  );
}

function formatClockTime(hour: number, minute: number, second: number): string {
  const normalizedHour = ((hour + 11) % 12) + 1;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const minuteString = minute.toString().padStart(2, '0');
  const secondString = second.toString().padStart(2, '0');

  if (second > 0) {
    return `${normalizedHour}:${minuteString}:${secondString} ${suffix}`;
  }

  return `${normalizedHour}:${minuteString} ${suffix}`;
}

function buildTimeDescriptions(rrule: ParsedRRule): string[] {
  const hours = (rrule.byhour ?? []).filter(isPresent);
  const minutes = (rrule.byminute ?? []).filter(isPresent);
  const seconds = (rrule.bysecond ?? []).filter(isPresent);

  if (!hours.length && !minutes.length && !seconds.length) {
    return [];
  }

  if (!hours.length) {
    if (minutes.length) {
      return minutes.map((minute) => `Minute ${minute}`);
    }

    if (seconds.length) {
      return seconds.map((second) => `Second ${second}`);
    }
  }

  const minuteValues = minutes.length ? minutes : [0];
  const secondValues = seconds.length ? seconds : [0];

  const times: string[] = [];

  for (const hour of hours) {
    for (const minute of minuteValues) {
      for (const second of secondValues) {
        times.push(formatClockTime(hour, minute, second));
      }
    }
  }

  return unique(times);
}

function parseRRuleDate(value?: string | null): RRuleDateParts | null {
  if (!value) return null;

  let raw = value.trim();
  let tzId: string | undefined;

  const tzMatch = raw.match(/^TZID=([^:]+):(.*)$/);
  if (tzMatch) {
    [, tzId, raw] = tzMatch;
  }

  let isUtc = false;
  if (raw.endsWith('Z')) {
    isUtc = true;
    raw = raw.slice(0, -1);
  }

  const [datePart, timePart] = raw.split('T');
  if (!datePart || datePart.length !== 8) return null;

  const year = Number.parseInt(datePart.slice(0, 4), 10);
  const month = Number.parseInt(datePart.slice(4, 6), 10);
  const day = Number.parseInt(datePart.slice(6, 8), 10);

  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return null;
  }

  if (!timePart) {
    return {
      year,
      month,
      day,
      hasTime: false,
      tzId,
      isUtc,
    };
  }

  const paddedTime = timePart.padEnd(6, '0');
  const hour = Number.parseInt(paddedTime.slice(0, 2), 10);
  const minute = Number.parseInt(paddedTime.slice(2, 4), 10);
  const second = Number.parseInt(paddedTime.slice(4, 6), 10);

  if (Number.isNaN(hour) || Number.isNaN(minute) || Number.isNaN(second)) {
    return null;
  }

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    hasTime: true,
    tzId,
    isUtc,
  };
}

function formatDateParts(parts: RRuleDateParts): string {
  const monthName = MONTH_NAMES[parts.month - 1] ?? `Month ${parts.month}`;
  const dayOrdinal = ordinalNumber(parts.day);
  let formatted = `${monthName} ${dayOrdinal}, ${parts.year}`;

  if (parts.hasTime && parts.hour !== undefined && parts.minute !== undefined) {
    const time = formatClockTime(parts.hour, parts.minute, parts.second ?? 0);
    formatted += ` at ${time}`;

    if (parts.isUtc) {
      formatted += ' UTC';
    } else if (parts.tzId) {
      formatted += ` (${parts.tzId})`;
    }
  }

  return formatted;
}

function formatFrequencyPhrase(rrule: ParsedRRule): string {
  const unit = FREQUENCY_UNITS[rrule.freq];
  const interval = rrule.interval && rrule.interval > 0 ? rrule.interval : 1;

  if (interval === 1) {
    if (rrule.freq === 'DAILY') return 'Every day';
    if (rrule.freq === 'WEEKLY') return 'Every week';
    if (rrule.freq === 'MONTHLY') return 'Every month';
    if (rrule.freq === 'YEARLY') return 'Every year';
    return `Every ${unit}`;
  }

  if (interval === 2) {
    if (rrule.freq === 'DAILY') return 'Every other day';
    if (rrule.freq === 'WEEKLY') return 'Every other week';
    if (rrule.freq === 'MONTHLY') return 'Every other month';
    if (rrule.freq === 'YEARLY') return 'Every other year';
  }

  const plural = interval === 1 ? unit : `${unit}s`;
  return `Every ${interval} ${plural}`;
}

function buildDayClause(rrule: ParsedRRule): string | null {
  const descriptions = buildDayDescriptions(rrule);
  if (!descriptions.length) return null;

  return `on ${formatList(descriptions)}`;
}

function buildMonthClause(rrule: ParsedRRule): string | null {
  const months = buildMonthDescriptions(rrule);
  if (!months.length) return null;

  return `in ${formatList(months)}`;
}

function buildMonthDayClause(rrule: ParsedRRule): string | null {
  const monthDays = buildMonthDayDescriptions(rrule);
  if (!monthDays.length) return null;

  if (monthDays.length === 1) {
    return `on the ${monthDays[0]} of the month`;
  }

  return `on the ${formatList(monthDays)} of the month`;
}

function buildTimeClause(rrule: ParsedRRule): string | null {
  const times = buildTimeDescriptions(rrule);
  if (!times.length) return null;

  return `at ${formatList(times)}`;
}

function buildEndClause(rrule: ParsedRRule): string | null {
  if (rrule.count && rrule.count > 0) {
    if (rrule.count === 1) {
      return 'for a single occurrence';
    }

    return `for ${rrule.count} occurrences`;
  }

  if (rrule.until) {
    const parts = parseRRuleDate(rrule.until);
    if (!parts) return null;

    return `until ${formatDateParts(parts)}`;
  }

  return null;
}

export function formatRRuleSummary(rrule: ParsedRRule): string {
  const segments: string[] = [];

  segments.push(formatFrequencyPhrase(rrule));

  const monthClause = buildMonthClause(rrule);
  if (monthClause) {
    segments.push(monthClause);
  }

  const dayClause = buildDayClause(rrule);
  if (dayClause) {
    segments.push(dayClause);
  } else {
    const monthDayClause = buildMonthDayClause(rrule);
    if (monthDayClause) {
      segments.push(monthDayClause);
    }
  }

  const timeClause = buildTimeClause(rrule);
  if (timeClause) {
    segments.push(timeClause);
  }

  const summary = segments.join(' ');

  const startParts = parseRRuleDate(rrule.dtstart ?? undefined);
  const startClause = startParts
    ? `starting ${formatDateParts(startParts)}`
    : null;
  const endClause = buildEndClause(rrule);

  const trailing: string[] = [];
  if (startClause) trailing.push(startClause);
  if (endClause) trailing.push(endClause);

  const fullSummary =
    trailing.length > 0 ? `${summary}, ${trailing.join(', ')}` : summary;

  return fullSummary.endsWith('.') ? fullSummary : `${fullSummary}.`;
}

export function formatRRuleFrequencyLabel(rrule: ParsedRRule): string {
  const unit = FREQUENCY_UNITS[rrule.freq];
  const interval = rrule.interval && rrule.interval > 0 ? rrule.interval : 1;

  if (interval === 1) {
    return FREQUENCY_LABELS[rrule.freq];
  }

  const plural = interval === 1 ? unit : `${unit}s`;
  return `Every ${interval} ${plural}`;
}

export function formatRRuleStart(rrule: ParsedRRule): string | null {
  const parts = parseRRuleDate(rrule.dtstart ?? undefined);
  if (!parts) return null;

  return formatDateParts(parts);
}

export function formatRRuleEnd(rrule: ParsedRRule): string | null {
  if (rrule.count && rrule.count > 0) {
    return rrule.count === 1
      ? 'After 1 occurrence'
      : `After ${rrule.count} occurrences`;
  }

  const parts = parseRRuleDate(rrule.until ?? undefined);
  if (!parts) return null;

  return formatDateParts(parts);
}

export function buildRRuleDetailSections(
  rrule: ParsedRRule,
): RRuleDetailSection[] {
  const sections: RRuleDetailSection[] = [];

  const dayDescriptions = buildDayDescriptions(rrule);
  if (dayDescriptions.length) {
    sections.push({ title: 'Days', items: dayDescriptions });
  }

  const timeDescriptions = buildTimeDescriptions(rrule);
  if (timeDescriptions.length) {
    sections.push({ title: 'Times', items: timeDescriptions });
  }

  const monthDescriptions = buildMonthDescriptions(rrule);
  if (monthDescriptions.length) {
    sections.push({ title: 'Months', items: monthDescriptions });
  }

  const monthDayDescriptions = buildMonthDayDescriptions(rrule);
  if (monthDayDescriptions.length) {
    sections.push({ title: 'Month Days', items: monthDayDescriptions });
  }

  const weekNumberDescriptions = buildWeekNumberDescriptions(rrule);
  if (weekNumberDescriptions.length) {
    sections.push({ title: 'Week Numbers', items: weekNumberDescriptions });
  }

  const yearDayDescriptions = buildYearDayDescriptions(rrule);
  if (yearDayDescriptions.length) {
    sections.push({ title: 'Year Days', items: yearDayDescriptions });
  }

  const minuteDescriptions = buildMinuteDescriptions(rrule);
  if (!timeDescriptions.length && minuteDescriptions.length) {
    sections.push({ title: 'Minutes', items: minuteDescriptions });
  }

  const secondDescriptions = buildSecondDescriptions(rrule);
  if (!timeDescriptions.length && secondDescriptions.length) {
    sections.push({ title: 'Seconds', items: secondDescriptions });
  }

  const positionDescriptions = buildSetPositionDescriptions(rrule);
  if (positionDescriptions.length && !dayDescriptions.length) {
    sections.push({ title: 'Set Positions', items: positionDescriptions });
  }

  if (rrule.wkst) {
    sections.push({
      title: 'Week Start',
      items: [DAY_NAMES[rrule.wkst] ?? rrule.wkst],
    });
  }

  return sections;
}

function rruleWithScheduleStart(
  rrule: ParsedRRule,
  schedule: ParsedSchedule,
): ParsedRRule {
  if (rrule.dtstart === schedule.dtstart) {
    return rrule;
  }

  return { ...rrule, dtstart: schedule.dtstart };
}

function formatExdate(value: string): string | null {
  const parts = parseRRuleDate(value);
  if (!parts) return null;

  return formatDateParts(parts);
}

export function formatScheduleSummary(schedule: ParsedSchedule): string {
  if (!schedule.rrule) {
    const start = formatScheduleStart(schedule);
    if (start) {
      return `Runs once on ${start}.`;
    }

    return 'Runs once.';
  }

  const rrule = rruleWithScheduleStart(schedule.rrule, schedule);
  return formatRRuleSummary(rrule);
}

export function formatScheduleFrequencyLabel(schedule: ParsedSchedule): string {
  if (!schedule.rrule) {
    return 'One-time event';
  }

  const rrule = rruleWithScheduleStart(schedule.rrule, schedule);
  return formatRRuleFrequencyLabel(rrule);
}

export function formatScheduleStart(schedule: ParsedSchedule): string | null {
  const parts = parseRRuleDate(schedule.dtstart);
  if (!parts) return schedule.dtstart || null;

  return formatDateParts(parts);
}

export function formatScheduleEnd(schedule: ParsedSchedule): string | null {
  if (!schedule.rrule) {
    return null;
  }

  const rrule = rruleWithScheduleStart(schedule.rrule, schedule);
  if (!rrule.until) {
    return null;
  }

  return formatRRuleEnd(rrule);
}

export function formatScheduleExdates(schedule: ParsedSchedule): string[] {
  const raw = schedule.exdate ?? [];
  return raw
    .map(formatExdate)
    .filter((value): value is string => Boolean(value));
}

export function buildScheduleDetailSections(
  schedule: ParsedSchedule,
): RRuleDetailSection[] {
  const sections: RRuleDetailSection[] = [];

  if (schedule.rrule) {
    sections.push(
      ...buildRRuleDetailSections(
        rruleWithScheduleStart(schedule.rrule, schedule),
      ),
    );
  }

  const exclusions = formatScheduleExdates(schedule);
  if (exclusions.length) {
    sections.push({ title: 'Exclusions', items: exclusions });
  }

  return sections;
}
