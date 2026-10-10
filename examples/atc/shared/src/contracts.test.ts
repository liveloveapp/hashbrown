import { expect, test } from 'vitest';
import {
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
