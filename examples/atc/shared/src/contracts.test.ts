import { expect, test } from 'vitest';
import {
  airportCardContract,
  SELECTED_PROMPT,
  STARTER_PROMPTS,
  starterPrompts,
  SYSTEM_PROMPT,
} from './contracts';

test('the selected-plane starter appears only while a plane is selected', () => {
  const none = starterPrompts(false);
  const selected = starterPrompts(true);

  expect(none).toEqual(STARTER_PROMPTS);
  expect(none).not.toContain(SELECTED_PROMPT);
  expect(selected).toEqual([SELECTED_PROMPT, ...STARTER_PROMPTS]);
});

test('the starters lead with the nearby-traffic flow', () => {
  expect(STARTER_PROMPTS[0]).toBe("What's flying near Bend?");
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
  expect(STARTER_PROMPTS).toContain('Show me Redmond airport.');
});

test('the prompt covers the airspace tools, and a starter asks about Portland', () => {
  expect(SYSTEM_PROMPT).toContain(
    "- For aircraft inside a place's airspace, call lookupPlace, then findAircraft with inAirspace, then highlightAircraft, then show one ArrivalsBoard. To only show a place's airspace, call showAirspace.",
  );
  expect(SYSTEM_PROMPT).toContain(
    '- For which airspace one aircraft is in, call airspaceAt.',
  );
  expect(SYSTEM_PROMPT).toContain(
    '- Airspace answers come only from tool results. Use checkedAltitudeFt, the altitude the airspace check used, only to explain why an aircraft near a floor or ceiling is in or out; otherwise don\'t mention it. ADS-B altitudes can be off by a few hundred feet, so say "about" near a floor or ceiling. Airspace whose partTime is true (on a shelf or an aircraft row) is in effect only during hours set by NOTAM, which the tools don\'t know: whenever a result has partTime true, end with one short sentence saying the airspace is part-time and may not be active now. Never say that when partTime is false. Never write a field name such as partTime or checkedAltitudeFt in the answer.',
  );
  expect(STARTER_PROMPTS.at(-1)).toBe(
    'Which planes are inside the Portland Class C?',
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
