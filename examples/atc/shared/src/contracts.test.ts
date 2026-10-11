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
  expect(STARTER_PROMPTS.at(-1)).toBe('Show me Redmond airport.');
});
