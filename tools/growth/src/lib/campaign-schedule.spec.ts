import { expect, test } from 'vitest';

import {
  businessMorningAfter,
  CAMPAIGN_TIME_ZONE,
  isCampaignSendWindow,
  nextPacificBusinessMorning,
  pacificCalendarDate,
} from './campaign-schedule.ts';

test('businessMorningAfter skips weekends, excludes the anchor day and lands on 07:00 Pacific', () => {
  const cases: readonly [string, number, string][] = [
    // Monday 05:00 Pacific plus one weekday is Tuesday.
    ['2026-09-07T12:00:00.000Z', 1, '2026-09-08T14:00:00.000Z'],
    // Friday, Saturday and Sunday all land on Monday.
    ['2026-09-11T18:00:00.000Z', 1, '2026-09-14T14:00:00.000Z'],
    ['2026-09-12T18:00:00.000Z', 1, '2026-09-14T14:00:00.000Z'],
    ['2026-09-13T18:00:00.000Z', 1, '2026-09-14T14:00:00.000Z'],
    ['2026-09-08T14:01:00.000Z', 3, '2026-09-11T14:00:00.000Z'],
    ['2026-09-11T14:01:00.000Z', 5, '2026-09-18T14:00:00.000Z'],
    ['2026-09-08T14:01:00.000Z', 8, '2026-09-18T14:00:00.000Z'],
    // Holidays are not skipped.
    ['2026-12-31T15:01:00.000Z', 1, '2027-01-01T15:00:00.000Z'],
    // 01:00Z on Tuesday is still Monday evening in Pacific time.
    ['2026-09-08T01:00:00.000Z', 1, '2026-09-08T14:00:00.000Z'],
    // Spring forward: Friday PST to Monday PDT.
    ['2026-03-06T15:01:00.000Z', 1, '2026-03-09T14:00:00.000Z'],
  ];

  const results = cases.map(([anchor, days]) =>
    businessMorningAfter(new Date(anchor), days).toISOString(),
  );

  expect(CAMPAIGN_TIME_ZONE).toBe('America/Los_Angeles');
  expect(results).toEqual(cases.map(([, , expected]) => expected));
});

test('businessMorningAfter is 07:00 Pacific across the 2026-11-01 DST change', () => {
  const fridayPdt = new Date('2026-10-30T14:01:00.000Z');
  const saturdayBeforeChange = new Date('2026-10-31T20:00:00.000Z');
  const sundayAfterChange = new Date('2026-11-01T20:00:00.000Z');

  const mondayAfterFriday = businessMorningAfter(fridayPdt, 1);
  const mondayAfterSaturday = businessMorningAfter(saturdayBeforeChange, 1);
  const tuesdayAfterSunday = businessMorningAfter(sundayAfterChange, 2);
  const backAcross = businessMorningAfter(
    new Date('2026-10-28T14:30:00.000Z'),
    5,
  );

  expect(mondayAfterFriday.toISOString()).toBe('2026-11-02T15:00:00.000Z');
  expect(mondayAfterSaturday.toISOString()).toBe('2026-11-02T15:00:00.000Z');
  expect(tuesdayAfterSunday.toISOString()).toBe('2026-11-03T15:00:00.000Z');
  expect(backAcross.toISOString()).toBe('2026-11-04T15:00:00.000Z');
  expect(
    [mondayAfterFriday, mondayAfterSaturday, tuesdayAfterSunday].map(
      isCampaignSendWindow,
    ),
  ).toEqual([true, true, true]);
});

test('businessMorningAfter and the calendar reject invalid dates and offsets', () => {
  const invalid = new Date('invalid');

  const offsets = [0, -1, 1.5, 367, Number.POSITIVE_INFINITY].map(
    (offset) => () => businessMorningAfter(new Date(), offset),
  );

  expect(() => businessMorningAfter(invalid, 1)).toThrow(
    'Invalid campaign date',
  );
  for (const offset of offsets) {
    expect(offset).toThrow('Invalid business-day offset');
  }
  expect(
    businessMorningAfter(new Date('2026-09-07T12:00:00.000Z'), 366),
  ).toBeInstanceOf(Date);
  expect(() => isCampaignSendWindow(invalid)).toThrow('Invalid campaign date');
  expect(() => pacificCalendarDate(invalid)).toThrow('Invalid campaign date');
  expect(() => nextPacificBusinessMorning(invalid)).toThrow(
    'Invalid campaign date',
  );
});

test('isCampaignSendWindow flips exactly at Pacific 07:00 and 08:00 on both sides of a DST change', () => {
  const cases: readonly [string, boolean][] = [
    // Friday 2026-10-30, PDT (UTC-7): the window is 14:00Z to 15:00Z.
    ['2026-10-30T13:59:58.000Z', false],
    ['2026-10-30T13:59:59.999Z', false],
    ['2026-10-30T14:00:00.000Z', true],
    ['2026-10-30T14:00:01.000Z', true],
    ['2026-10-30T14:59:59.999Z', true],
    ['2026-10-30T15:00:00.000Z', false],
    // Monday 2026-11-02, PST (UTC-8): the window is 15:00Z to 16:00Z.
    ['2026-11-02T14:59:59.999Z', false],
    ['2026-11-02T15:00:00.000Z', true],
    ['2026-11-02T15:59:59.999Z', true],
    ['2026-11-02T16:00:00.000Z', false],
    // Friday 2026-03-06 PST and Monday 2026-03-09 PDT.
    ['2026-03-06T14:59:59.999Z', false],
    ['2026-03-06T15:00:00.000Z', true],
    ['2026-03-06T16:00:00.000Z', false],
    ['2026-03-09T13:59:59.999Z', false],
    ['2026-03-09T14:00:00.000Z', true],
    ['2026-03-09T15:00:00.000Z', false],
    // Saturday and Sunday at 07:00 Pacific are never inside the window.
    ['2026-10-31T14:30:00.000Z', false],
    ['2026-11-01T15:30:00.000Z', false],
  ];

  const results = cases.map(([instant]) =>
    isCampaignSendWindow(new Date(instant)),
  );

  expect(results).toEqual(cases.map(([, expected]) => expected));
});

test('nextPacificBusinessMorning returns today 07:00 before 07:00 on a weekday, else the next business morning', () => {
  const cases: readonly [string, string][] = [
    // Wednesday 06:59:59 PDT: today at 07:00.
    ['2026-09-16T13:59:59.000Z', '2026-09-16T14:00:00.000Z'],
    // Wednesday 00:00 PDT: today at 07:00.
    ['2026-09-16T07:00:00.000Z', '2026-09-16T14:00:00.000Z'],
    // Wednesday 07:00 PDT exactly: tomorrow.
    ['2026-09-16T14:00:00.000Z', '2026-09-17T14:00:00.000Z'],
    // Friday 16:30 PDT: Monday.
    ['2026-09-18T23:30:00.000Z', '2026-09-21T14:00:00.000Z'],
    // Saturday 05:00 PDT: Monday, never the weekend.
    ['2026-09-19T12:00:00.000Z', '2026-09-21T14:00:00.000Z'],
    // Monday 2026-11-02 06:00 PST, after the DST change: today at 07:00 PST.
    ['2026-11-02T14:00:00.000Z', '2026-11-02T15:00:00.000Z'],
    // Sunday 2026-11-01 01:30 (the repeated hour): Monday 07:00 PST.
    ['2026-11-01T09:30:00.000Z', '2026-11-02T15:00:00.000Z'],
  ];

  const results = cases.map(([instant]) =>
    nextPacificBusinessMorning(new Date(instant)).toISOString(),
  );

  expect(results).toEqual(cases.map(([, expected]) => expected));
});

test('pacificCalendarDate returns the Pacific calendar date and whether it is a weekday', () => {
  const wednesdayAfternoon = new Date('2026-09-16T23:30:00.000Z');
  const fridayLastMinute = new Date('2026-09-19T06:59:00.000Z');
  const saturdayMidnight = new Date('2026-09-19T07:00:00.000Z');

  const results = [wednesdayAfternoon, fridayLastMinute, saturdayMidnight].map(
    pacificCalendarDate,
  );

  expect(results).toEqual([
    { date: '2026-09-16', weekday: true },
    { date: '2026-09-18', weekday: true },
    { date: '2026-09-19', weekday: false },
  ]);
});
