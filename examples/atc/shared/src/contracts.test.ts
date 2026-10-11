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
    '- Airspace answers come only from tool results. ADS-B altitudes can be off by a few hundred feet, so say "about" near a floor or ceiling. Airspace marked partTime is in effect only during hours set by NOTAM, which the tools don\'t know: when partTime is true, say the aircraft is inside the charted area and that it may not be active now.',
  );
  expect(STARTER_PROMPTS.at(-1)).toBe(
    'Which planes are inside the Portland Class C?',
  );
});
