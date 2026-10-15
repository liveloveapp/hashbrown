import { expect, test } from 'vitest';
import { cardIssues, mapIssues, proseIssues } from './prose-check';

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

test('a lead-in before the answer is reported', () => {
  const prose = [
    "Here's what is flying near Bend.",
    'Sure, N484SJ is the highest.',
    'Let me check the board.',
    'Here are the arrivals at Seattle.',
    'Heres the answer: N484SJ.',
  ];

  const kinds = proseIssues(prose).map((issue) => issue.kind);

  expect(kinds).toEqual([
    'lead-in',
    'lead-in',
    'lead-in',
    'lead-in',
    'lead-in',
  ]);
});

test('an answer that names the aircraft first is not a lead-in', () => {
  const prose = [
    'Herein lies nothing.',
    'Seven aircraft are inside the Portland Class C.',
    'I highlighted the aircraft near Bend.',
  ];

  const issues = proseIssues(prose);

  expect(issues).toEqual([]);
});

test('the cards an answer shows follow the prompt: one board, one card, or one compare', () => {
  const none = { boards: 0, flightCards: 0, compares: 0, airportCards: 0 };
  const board = { ...none, boards: 1 };
  const card = { ...none, flightCards: 1 };
  const compare = { ...none, compares: 1 };
  const airport = { ...none, airportCards: 1 };

  const issues = [none, board, card, compare, airport].map(cardIssues);

  expect(issues).toEqual([[], [], [], [], []]);
});

test('extra cards are reported', () => {
  const none = { boards: 0, flightCards: 0, compares: 0, airportCards: 0 };
  const twoBoards = { ...none, boards: 2 };
  const boardAndCards = { ...none, boards: 1, flightCards: 2 };
  const twoCards = { ...none, flightCards: 2 };
  const compareAndCard = { ...none, compares: 1, flightCards: 1 };

  const issues = [twoBoards, boardAndCards, twoCards, compareAndCard].map(
    cardIssues,
  );

  expect(issues).toEqual([
    [{ kind: 'extra-cards', text: 'Showed 2 boards' }],
    [{ kind: 'extra-cards', text: 'Showed 1 board and 2 flight cards' }],
    [{ kind: 'extra-cards', text: 'Showed 2 flight cards' }],
    [{ kind: 'extra-cards', text: 'Showed 1 compare and 1 flight card' }],
  ]);
});
