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

const ParseErrorSchema = s.object('PARSE_ERROR', {
  type: s.literal('PARSE_ERROR'),
  error: s.streaming.string('The error message'),
});

const ParseResultSchema = s.object('Parse Result', {
  result: s.anyOf([RRuleSchema, ParseErrorSchema]),
});

@Injectable({ providedIn: 'root' })
export class RRuleParser {
  parse(input: Signal<string | null | undefined>): {
    rrule: Signal<s.Infer<typeof ParseResultSchema>['result'] | null>;
    isLoading: Signal<boolean>;
    error: Signal<Error | undefined>;
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
          - timezone: The timezone of the user.
          - today: The current date in the user's timezone as an ISO string.
  
        OUTPUT: **Only** a JSON object that strictly matches the schema provided by the host application.  
        • If parsing succeeds -> contains the RRULE fields.  
        • If parsing fails -> \`"error"\` contains a short English message.
  
        ─────────────────────────────────────────────────────────────────────────────
        GENERAL RULES
        1.  **Time-zone detection**  
            ▸ If the user names a zone or says “UTC”/“Z”, honour it.  
            ▸ Otherwise use the timezone provided in the input.
        2.  **DTSTART**  
            ▸ Assume it starts today if not specified.
            ▸ Local zone: \`"TZID=<Zone>:YYYYMMDDThhmmss"\` (RFC 5545 basic).  
            ▸ UTC: \`"YYYYMMDDThhmmssZ"\`.  
        3.  **UNTIL**  
            ▸ Only emit if the user gives an explicit end.  
            ▸ When \`DTSTART\` carries \`TZID\`, convert UNTIL to UTC and append **Z**.  
        4.  **Keep DTSTART and UNTIL the same value-type** (DATE vs DATE-TIME).  
        5.  Omit any property that is \`null\` or \`undefined\`; never include extras.  
        6.  BY-lists (BYHOUR, BYMINUTE, ...) are always arrays. Even single values go in arrays.  
        7.  Only include \`WKST\` if the user says something like “weeks start on Monday”.  
        8.  Reject ambiguous or unsupported input with an error. Do **not** guess.  
        9.  Resolve relative dates to the current date using the today provided in the input.
  
        ─────────────────────────────────────────────────────────────────────────────
        PHRASE -> RULE TRANSLATIONS
        • “every &lt;day&gt; thereafter”            -> DTSTART = first date/time, FREQ=WEEKLY, BYDAY = [&lt;day&gt;].  
        • “every other …” / “alternate …”           -> INTERVAL = 2.  
        • “first/second/last &lt;day&gt; of month”  -> FREQ=MONTHLY, BYDAY = [&lt;day&gt;], BYSETPOS = [1 | 2 | -1].  
        • “for N times/days/weeks/occurrences”      -> COUNT = N.  
        • “until &lt;date/time&gt;”                 -> UNTIL = that absolute moment.  
  
        ─────────────────────────────────────────────────────────────────────────────
        OUTPUT FORMAT
        \`\`\`json
        { "error": null, ... }
        \`\`\`
        Nothing else—no markdown, no prose.
  
        ─────────────────────────────────────────────────────────────────────────────
        EXAMPLES
        - Input: "Every other Tuesday at 7:00 PM"  
          Output:
          { "error": null,
            "freq": "WEEKLY",
            "interval": 2,
            "byday": ["TU"],
            "byhour": [19],
            "byminute": [0]
          }
  
        - Input: "First Monday of each month at 9am PST"  
          Output:
          { "error": null,
            "freq": "MONTHLY",
            "byday": ["MO"],
            "bysetpos": [1],
            "byhour": [9],
            "byminute": [0]
          }
  
        - Input: "Every day at 6:30 for 10 days"  
          Output:
          { "error": null,
            "freq": "DAILY",
            "byhour": [6],
            "byminute": [30],
            "count": 10
          }
  
        - Input: "March 10 2026 14:00 UTC"  
          Output:
          { "error": null,
            "dtstart": "20260310T140000Z",
            "freq": "DAILY",
            "byhour": [14],
            "byminute": [0],
            "count": 1,
            "until": "20260310T140000Z"
          }
  
        - Input: "Start on July 4 2025 at 9:00 AM America/Los_Angeles and repeat daily"  
          Output:
          { "error": null,
            "dtstart": "TZID=America/Los_Angeles:20250704T090000",
            "freq": "DAILY",
            "byhour": [9],
            "byminute": [0]
          }
  
        - Input: "June 27th at 6:00 pm and every Monday thereafter"  
          Output:
          { "error": null,
            "dtstart": "TZID=America/Los_Angeles:20250627T180000",
            "freq": "WEEKLY",
            "byday": ["MO"],
            "byhour": [18],
            "byminute": [0]
          }
  
        - Input: "sometime next week"  
          Output:
          { "error": "This description is too vague. Please clarify the date and time." }
      `,
      schema: ParseResultSchema,
    });

    return {
      rrule: computed(() => {
        const value = resource.value();

        if (!value) return null;

        return value.result;
      }),
      error: resource.error,
      isLoading: resource.isLoading,
    };
  }
}
