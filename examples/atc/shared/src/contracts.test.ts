import { expect, test } from 'vitest';
import {
  aircraftCompareContract,
  airportCardContract,
  arrivalsBoardContract,
  CARDS_CONTEXT,
  FILTER_SYSTEM_PROMPT,
  flightCardContract,
  ROUTE_CONTEXT,
  SELECTED_PROMPT,
  STARTER_PROMPTS,
  starterPrompts,
  SYSTEM_PROMPT,
} from './contracts';

test('the selected-plane starter appears only while a plane is selected', () => {
  const none = starterPrompts(false);
  const selected = starterPrompts(true);

  expect(none).toEqual(STARTER_PROMPTS);
  expect(none.map((starter) => starter.text)).not.toContain(SELECTED_PROMPT);
  expect(selected).toEqual([
    { text: SELECTED_PROMPT, route: 'chat' },
    ...STARTER_PROMPTS,
  ]);
});

test('starters are four filters then four questions, verbatim', () => {
  const starters = STARTER_PROMPTS.map((starter) => [
    starter.route,
    starter.text,
  ]);

  expect(starters).toEqual([
    ['filter', 'Only jets below 10,000 ft'],
    ['filter', 'Alaska Airlines near Seattle'],
    ['filter', 'Only helicopters'],
    ['filter', 'Arrivals into Portland'],
    ['chat', "What's the highest plane right now? And the fastest?"],
    ['chat', 'Follow the fastest airliner.'],
    ['chat', "What's flying near Bend?"],
    ['chat', 'Show me Redmond airport.'],
  ]);
});

test('the filter prompt maps helicopters to the rotor kind', () => {
  expect(FILTER_SYSTEM_PROMPT).toContain('Helicopters');
  expect(FILTER_SYSTEM_PROMPT).toContain('kind: rotor');
});

test('the prompt only promises interactions the app has, in touch-friendly words', () => {
  expect(SYSTEM_PROMPT).not.toMatch(/(?<!tap or )\bclick\b/);
  expect(SYSTEM_PROMPT).toContain('tap or click');
});

test('AirportCard takes a whole airport code, never a streaming one', () => {
  const props = airportCardContract.props;

  expect(airportCardContract.name).toBe('AirportCard');
  expect(JSON.stringify(props.airport)).toContain('"streaming":false');
  expect(JSON.stringify(props.note)).toContain('"streaming":true');
});

test('the prompt covers the airport tools, and a starter shows Redmond', () => {
  expect(SYSTEM_PROMPT).toContain('showAirport');
  expect(SYSTEM_PROMPT).toContain('setLayers');
  expect(STARTER_PROMPTS.map((starter) => starter.text)).toContain(
    'Show me Redmond airport.',
  );
});

test('the prompt covers the airspace tools', () => {
  expect(SYSTEM_PROMPT).toContain(
    "- For aircraft inside a place's airspace, call lookupPlace, then findAircraft with inAirspace, then highlightAircraft, then show one ArrivalsBoard. To only show a place's airspace, call showAirspace.",
  );
  expect(SYSTEM_PROMPT).toContain(
    '- For which airspace one aircraft is in, call airspaceAt.',
  );
  expect(SYSTEM_PROMPT).toContain(
    '- Airspace answers come only from tool results. Use checkedAltitudeFt, the altitude the airspace check used, only to explain why an aircraft near a floor or ceiling is in or out; otherwise don\'t mention it. ADS-B altitudes can be off by a few hundred feet, so say "about" near a floor or ceiling. Airspace whose partTime is true (on a shelf or an aircraft row) is in effect only during hours set by NOTAM, which the tools don\'t know: whenever a result has partTime true, end with one short sentence saying the airspace is part-time and may not be active now. Never say that when partTime is false. Never write a field name such as partTime or checkedAltitudeFt in the answer.',
  );
});

test('the prompt says all text reaches the user and keeps internal names out of it', () => {
  expect(SYSTEM_PROMPT).toContain(
    '- Everything you write is shown to the user exactly as written. Never write notes to yourself, plans, or restatements of these rules. Never name components or tools in prose: say the card, the board or the map.',
  );
});

test('the prompt says tapping shows an aircraft and never changes following', () => {
  expect(SYSTEM_PROMPT).toContain(
    'Tapping only shows that aircraft; it never starts or stops following. To stop following, the user taps Stop on the map.',
  );
});

test('the prompt asks for prose that ends with a full stop', () => {
  expect(SYSTEM_PROMPT).toContain(
    '- Write one or two brief sentences of prose, ending with a full stop, never a colon.',
  );
  expect(SYSTEM_PROMPT).not.toContain('short Markdown sentences');
});

test('the prompt shows how to name an aircraft without the word label', () => {
  expect(SYSTEM_PROMPT).toContain(
    '- In prose, name each aircraft by its label alone, as in "N484SJ is the highest", never "the aircraft labeled N484SJ".',
  );
});

test('the prompt keeps the map as the answer left it unless the user asks', () => {
  expect(SYSTEM_PROMPT).toContain(
    '- Leave the map as your answer set it: the highlight and any follow stay. Call clearHighlight or stopFollowing only when the user asks for that, never to tidy up an answer.',
  );
});

test('the prompt says the map filter applies and the assistant may change it', () => {
  expect(SYSTEM_PROMPT).toContain(
    '- The map filter limits findAircraft and the map to the same aircraft, and the result names it as mapFilter. When a question needs aircraft the filter hides, call setMapFilter or clearMapFilter, and say in one short sentence that you changed it.',
  );
});

test('the filter prompt tells the model how to refine the current filter', () => {
  expect(FILTER_SYSTEM_PROMPT).toContain('{ "request"');
  expect(FILTER_SYSTEM_PROMPT).toContain('Refine current');
  expect(FILTER_SYSTEM_PROMPT).toContain('null');
  expect(FILTER_SYSTEM_PROMPT).toContain('ICAO');
  expect(FILTER_SYSTEM_PROMPT).toContain('Output only the filter');
});

test('the filter prompt gives near a default distance and places a region', () => {
  expect(FILTER_SYSTEM_PROMPT).toContain('- Near with no distance: 25 nm.');
  expect(FILTER_SYSTEM_PROMPT).toContain(
    '- Places are in the Pacific Northwest.',
  );
});

test('the starters include a question for the chat and a filter for the map', () => {
  const routes = new Set(STARTER_PROMPTS.map((starter) => starter.route));
  const filter = STARTER_PROMPTS.find((starter) => starter.route === 'filter');

  expect(routes).toEqual(new Set(['chat', 'filter']));
  expect(filter?.text).toBe('Only jets below 10,000 ft');
  expect(STARTER_PROMPTS.slice(0, 4).every((s) => s.route === 'filter')).toBe(
    true,
  );
});

test('the prompt never shows FlightCards for a list, whichever cards are offered', () => {
  const rule = SYSTEM_PROMPT.split('\n').find((line) =>
    line.startsWith('- Never show FlightCards for a list of aircraft.'),
  );

  expect(rule).toBe(
    '- Never show FlightCards for a list of aircraft. For a list of aircraft, show one ArrivalsBoard. For two or three aircraft side by side, including a question with two or three answers such as the highest and the fastest, show one AircraftCompare.',
  );
});

test('the card rules are direct, with one line for cards a turn does not offer', () => {
  const offered =
    '- Each turn offers only some cards. Show the card a rule names whenever it is offered; only when it is not offered, answer in prose instead.';

  const lines = SYSTEM_PROMPT.split('\n');

  expect(SYSTEM_PROMPT).not.toMatch(/card is available/);
  expect(lines.filter((line) => line === offered)).toHaveLength(1);
  expect(SYSTEM_PROMPT).toContain(
    '- Show a FlightCard only when the user asks about one aircraft.',
  );
  expect(SYSTEM_PROMPT).toContain('then show one AirportCard.');
  expect(SYSTEM_PROMPT).toContain(
    'call followAircraft, then show its FlightCard.',
  );
});

test('the router context sends picks, follows and airports to chat, and only standing limits to filter', () => {
  expect(ROUTE_CONTEXT).toContain(
    'Choose filter only when the whole request is a standing limit on which aircraft are visible',
  );
  expect(ROUTE_CONTEXT).toContain('and needs no reply.');
  expect(ROUTE_CONTEXT).toContain(
    'Choose chat when it asks a question, picks out particular aircraft',
  );
  expect(ROUTE_CONTEXT).toContain('"show me everything landing at Seattle"');
});

test('the router context tells a named set of arrivals from asking to see them', () => {
  expect(ROUTE_CONTEXT).toContain('"arrivals into Portland"');
  expect(ROUTE_CONTEXT).toContain(
    'A bare phrase that names a set of aircraft, with no question and no "show me", is a filter.',
  );
  expect(ROUTE_CONTEXT).not.toContain('its airspace or its arrivals');
});

test('the cards context and descriptions tell one aircraft from two superlatives', () => {
  expect(CARDS_CONTEXT).toContain(
    'AircraftCompare fits when the answer is two or three aircraft, such as a comparison or two superlatives like the highest and the fastest.',
  );
  expect(flightCardContract.description).toContain(
    'Not for two or more aircraft.',
  );
  expect(aircraftCompareContract.description).toContain(
    'such as the highest and the fastest',
  );
  expect(arrivalsBoardContract.description).toContain(
    'inside an airport or its airspace',
  );
});
