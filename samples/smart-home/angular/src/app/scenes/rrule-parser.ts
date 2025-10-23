import { computed, Injectable, Signal } from '@angular/core';
import { structuredCompletionResource } from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';

const RRuleSchema = s.streaming.object('RRULE', {
  type: s.literal('RRULE'),
  freq: s.enumeration('Recurrence frequency (FREQ)', [
    'SECONDLY',
    'MINUTELY',
    'HOURLY',
    'DAILY',
    'WEEKLY',
    'MONTHLY',
    'YEARLY',
  ]),
  dtstart: s.string(
    'Start date-time (DTSTART) in RFC 5545 basic format YYYYMMDDTHHMMSS, optionally suffixed with "Z" for UTC or prefixed with "TZID=ZoneID:" for a specific time-zone',
  ),
  until: s.anyOf([
    s.nullish(),
    s.string('End date-time (UNTIL) in UTC format YYYYMMDDTHHMMSSZ'),
  ]),
  count: s.anyOf([s.nullish(), s.number('Number of occurrences (COUNT)')]),
  interval: s.anyOf([
    s.nullish(),
    s.number('Interval between recurrences (INTERVAL); default is 1'),
  ]),
  bysecond: s.anyOf([
    s.nullish(),
    s.array(
      'Seconds list (BYSECOND)',
      s.number('Second value between 0 and 59'),
    ),
  ]),
  byminute: s.anyOf([
    s.nullish(),
    s.array(
      'Minutes list (BYMINUTE)',
      s.number('Minute value between 0 and 59'),
    ),
  ]),
  byhour: s.anyOf([
    s.nullish(),
    s.array('Hours list (BYHOUR)', s.number('Hour value between 0 and 23')),
  ]),
  bymonthday: s.anyOf([
    s.nullish(),
    s.array(
      'Month days list (BYMONTHDAY)',
      s.number('Day of month between 1 and 31'),
    ),
  ]),
  byyearday: s.anyOf([
    s.nullish(),
    s.array(
      'Year days list (BYYEARDAY)',
      s.number('Day of year between -366 and 366'),
    ),
  ]),
  byweekno: s.anyOf([
    s.nullish(),
    s.array(
      'Week numbers list (BYWEEKNO)',
      s.number('ISO week number between -53 and 53'),
    ),
  ]),
  bymonth: s.anyOf([
    s.nullish(),
    s.array('By month', s.number('Month value between 1 and 12')),
  ]),
  bysetpos: s.anyOf([
    s.nullish(),
    s.array(
      'Set positions list (BYSETPOS)',
      s.number('Set position between -366 and 366'),
    ),
  ]),
  byday: s.anyOf([
    s.nullish(),
    s.array(
      'Days of week list (BYDAY) e.g. ["TU", "TH"]',
      s.string('Two-letter day code: MO, TU, WE, TH, FR, SA, SU'),
    ),
  ]),
  wkst: s.anyOf([
    s.nullish(),
    s.string('Week start day code: MO, TU, WE, TH, FR, SA, SU'),
  ]),
});

const ScheduleSchema = s.streaming.object('SCHEDULE', {
  type: s.literal('SCHEDULE'),
  dtstart: s.string(
    'Start date-time (DTSTART) in RFC 5545 basic format YYYYMMDDTHHMMSS, optionally suffixed with "Z" for UTC or prefixed with "TZID=ZoneID:" for a specific time-zone',
  ),
  exdate: s.anyOf([
    s.nullish(),
    s.array(
      'Exclusion dates (EXDATE) in RFC 5545 format YYYYMMDDTHHMMSS[Z]',
      s.string(
        'Exclusion date-time in RFC 5545 basic format; support TZID prefix or trailing Z',
      ),
    ),
  ]),
  rrule: s.anyOf([RRuleSchema, s.nullish()]),
});

const ParseErrorSchema = s.object('PARSE_ERROR', {
  type: s.literal('PARSE_ERROR'),
  error: s.streaming.string('The error message'),
});

const ParseResultSchema = s.object('Parse Result', {
  result: s.anyOf([ScheduleSchema, ParseErrorSchema]),
});

@Injectable({ providedIn: 'root' })
export class RRuleParser {
  parse(input: Signal<string | null | undefined>): {
    schedule: Signal<s.Infer<typeof ScheduleSchema> | null>;
    isLoading: Signal<boolean>;
    error: Signal<s.Infer<typeof ParseErrorSchema> | null>;
  } {
    const resource = structuredCompletionResource({
      model: 'gpt-4.1',
      debugName: 'rruleParserResource',
      input: computed(() => {
        const value = input();

        if (!value) return null;

        return {
          input: value,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          today: new Date().toISOString(),
        };
      }),
      system: `
        You are an RFC 5545-compliant scheduling parser.

        INPUT FORMAT:
          - input: A short English description of a one-off or recurring event (e.g. "every other Tuesday at 7 pm", "June 27th at 6 pm and every Monday thereafter", "first Mon of each month at 09:00 PST").
          - timezone: The user's IANA timezone.
          - today: The current date in the user's timezone as an ISO string.

        OUTPUT: **Only** a JSON object that strictly matches the schema provided by the host application.
        • If parsing succeeds -> \`result\` MUST be an object with:
            ▸ \`dtstart\`: RFC 5545 DATE or DATE-TIME string (may include TZID or trailing Z) that is strictly after \`today\`.
            ▸ \`exdate\`: either omitted/null, or an array of RFC 5545 DATE/DATE-TIME strings matching the DTSTART value type.
            ▸ \`rrule\`: either a valid RRULE object per the provided schema or null for one-off events.
        • If parsing fails -> \`result\` MUST be \`{ "type": "PARSE_ERROR", "error": "..." }\` with a short English message.

        ─────────────────────────────────────────────────────────────────────────────
        FIELD RULES
        1. **Time-zone detection**
           ▸ Honour explicit zones or “UTC”/“Z”.
           ▸ Otherwise, default to the supplied \`timezone\`.
        2. **DTSTART**
           ▸ Always emit.
           ▸ When unspecified, assume the earliest future instance consistent with the description.
           ▸ Local zone: \`"TZID=<Zone>:YYYYMMDDThhmmss"\` (RFC 5545 basic).
           ▸ UTC: \`"YYYYMMDDThhmmssZ"\`.
           ▸ Must be strictly later than \`today\`.
        3. **EXDATE**
           ▸ Only include when the user specifies exclusions.
           ▸ Match DTSTART's value type (pure dates stay dates; date-times stay date-times).
           ▸ De-duplicate entries.
        4. **RRULE**
           ▸ Use null for single occurrences.
           ▸ Apply schema rules: keep DTSTART/UNTIL value types aligned, convert UNTIL to UTC when DTSTART uses TZID, put singular values in arrays, and omit WKST unless stated.
        5. **General**
           ▸ Omit properties that are null or undefined; never add extras.
           ▸ Reject ambiguous or unsupported requests with a parse error.
           ▸ Resolve relative language (“next Friday”) against \`today\`.

        ─────────────────────────────────────────────────────────────────────────────
        PHRASE -> RULE TRANSLATIONS
        • “every <day> thereafter”             -> DTSTART = first occurrence, RRULE.freq = WEEKLY, BYDAY = [<day>].
        • “every other ...” / “alternate ...”  -> RRULE.interval = 2.
        • “first/second/last <day> of month”   -> RRULE.freq = MONTHLY, BYDAY = [<day>], BYSETPOS = [1 | 2 | -1].
        • “for N times/days/weeks”             -> RRULE.count = N.
        • “until <date/time>”                  -> RRULE.until = absolute instant (UTC when DTSTART has TZID).

        ─────────────────────────────────────────────────────────────────────────────
        OUTPUT FORMAT
        \`\`\`json
        { "result": { "dtstart": "...", "exdate": null, "rrule": { ... } } }
        \`\`\`
        Nothing else — no markdown, no commentary.

        ─────────────────────────────────────────────────────────────────────────────
        EXAMPLES
        - Input: "Every other Tuesday at 7:00 PM"  
          Output:
          { "result": {
              "dtstart": "TZID=America/Los_Angeles:20250701T190000",
              "exdate": null,
              "rrule": {
                "type": "RRULE",
                "freq": "WEEKLY",
                "interval": 2,
                "byday": ["TU"],
                "byhour": [19],
                "byminute": [0],
                "dtstart": "TZID=America/Los_Angeles:20250701T190000"
              }
            } }

        - Input: "June 27th at 6:00 pm and every Monday thereafter"  
          Output:
          { "result": {
              "dtstart": "TZID=America/Los_Angeles:20250627T180000",
              "exdate": null,
              "rrule": {
                "type": "RRULE",
                "freq": "WEEKLY",
                "byday": ["MO"],
                "byhour": [18],
                "byminute": [0],
                "dtstart": "TZID=America/Los_Angeles:20250627T180000"
              }
            } }

        - Input: "Tomorrow at 9am"  
          Output:
          { "result": {
              "dtstart": "TZID=America/Los_Angeles:20250625T090000",
              "exdate": null,
              "rrule": null
            } }

        - Input: "Sometime next week"  
          Output:
          { "result": { "type": "PARSE_ERROR", "error": "This description is too vague. Please clarify the date and time." } }
      `,
      schema: ParseResultSchema,
    });

    const result = computed(() => {
      const value = resource.value();

      return value?.result;
    });

    const error = computed(() => {
      const value = result();

      return value && value.type === 'PARSE_ERROR' ? value : null;
    });

    const schedule = computed(() => {
      const value = result();

      return value && value.type === 'SCHEDULE' ? value : null;
    });

    return {
      schedule,
      error,
      isLoading: resource.isLoading,
    };
  }
}
