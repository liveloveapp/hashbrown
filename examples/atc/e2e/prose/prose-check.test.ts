import { expect, test } from 'vitest';
import { mapIssues, proseIssues } from './prose-check';

test('a plain answer has no issues', () => {
  const prose = ['N484SJ is the highest, and UAL45 is the fastest.'];

  const issues = proseIssues(prose);

  expect(issues).toEqual([]);
});

test('an echoed rule is reported as a leak', () => {
  const prose = ['Two short sentences.', 'The map shows aircraft near Bend.'];

  const issues = proseIssues(prose);

  expect(issues).toEqual([{ kind: 'leak', text: 'Two short sentences.' }]);
});

test('component and tool names are reported', () => {
  const prose = [
    'I am following ASA322 and showing its live FlightCard.',
    'I called findAircraft for you.',
  ];

  const issues = proseIssues(prose).map((issue) => issue.kind);

  expect(issues).toEqual(['internal-name', 'internal-name']);
});

test('the word label used about an aircraft is reported as a leak', () => {
  const prose = ['Highest now, the aircraft labeled N484SJ.'];

  const issues = proseIssues(prose).map((issue) => issue.kind);

  expect(issues).toEqual(['leak']);
});

test('prose that ends on a colon is reported', () => {
  const prose = ['All aircraft inside Portland Class C, nearest first:'];

  const issues = proseIssues(prose).map((issue) => issue.kind);

  expect(issues).toEqual(['dangling-colon']);
});

test('promising that a tap follows a plane is reported, but Tap Stop is fine', () => {
  const prose = [
    'Tap either card to follow the aircraft on the map.',
    'I am following CHH7925. Tap Stop on the map to stop following.',
  ];

  const issues = proseIssues(prose);

  expect(issues).toEqual([
    {
      kind: 'false-tap',
      text: 'Tap either card to follow the aircraft on the map.',
    },
  ]);
});

test('a tool field name in the prose is reported as an internal name', () => {
  const prose = [
    'All listed aircraft are inside the Portland Class C.',
    'Aircraft with partTime airspace may not be controlled right now.',
  ];

  const issues = proseIssues(prose).map((issue) => issue.kind);

  expect(issues).toEqual(['internal-name']);
});

test('an answer that shows aircraft but leaves none highlighted is reported', () => {
  const cleared = { shown: 2, highlighted: 0, clearedUnasked: false };
  const kept = { shown: 2, highlighted: 2, clearedUnasked: false };
  const noAircraft = { shown: 0, highlighted: 0, clearedUnasked: false };

  const issues = [cleared, kept, noAircraft].map(mapIssues);

  expect(issues).toEqual([
    [
      {
        kind: 'no-highlight',
        text: 'Showed 2 aircraft, highlighted none on the map',
      },
    ],
    [],
    [],
  ]);
});

test('clearing the highlight without being asked is reported once', () => {
  const proseOnly = { shown: 0, highlighted: 0, clearedUnasked: true };
  const withCards = { shown: 2, highlighted: 0, clearedUnasked: true };

  const issues = [proseOnly, withCards].map(mapIssues);

  expect(issues).toEqual([
    [{ kind: 'cleared-highlight', text: 'Cleared the highlight unasked' }],
    [{ kind: 'cleared-highlight', text: 'Cleared the highlight unasked' }],
  ]);
});
