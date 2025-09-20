export type RRuleFrequency =
  | 'SECONDLY'
  | 'MINUTELY'
  | 'HOURLY'
  | 'DAILY'
  | 'WEEKLY'
  | 'MONTHLY'
  | 'YEARLY';

export interface ParsedRRule {
  type: 'RRULE';
  freq: RRuleFrequency;
  dtstart: string;
  until?: string | null;
  count?: number | null;
  interval?: number | null;
  bysecond?: number[] | null;
  byminute?: number[] | null;
  byhour?: number[] | null;
  bymonthday?: number[] | null;
  byyearday?: number[] | null;
  byweekno?: number[] | null;
  bymonth?: number[] | null;
  bysetpos?: number[] | null;
  byday?: string[] | null;
  wkst?: string | null;
}

export interface ParsedSchedule {
  dtstart: string;
  exdate?: string[] | null;
  rrule: ParsedRRule | null;
}

export interface ParsedRRuleError {
  type: 'PARSE_ERROR';
  error: string;
}

export type ParsedScheduleResult = ParsedSchedule | ParsedRRuleError;
