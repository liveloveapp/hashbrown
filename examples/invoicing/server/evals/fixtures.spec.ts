import { expect, test } from 'vitest';
import { recordingsToFixtures, siblingFixturePath } from './fixtures';

test('re-keys each recording from its own request, not its ordinal', () => {
  const fixtures = recordingsToFixtures([
    {
      request: {
        messages: [
          { role: 'system', content: 's' },
          { role: 'user', content: 'Q' },
        ],
      },
      response: {
        toolCalls: [{ id: 'c1', name: 'ledgerSummary', arguments: {} }],
      },
    },
    {
      request: {
        messages: [
          { role: 'system', content: 's' },
          { role: 'user', content: 'Q' },
          { role: 'assistant', content: '' },
          { role: 'tool', content: '{}' },
        ],
      },
      response: {
        toolCalls: [{ id: 'c2', name: 'render', arguments: { text: 'Hi' } }],
      },
    },
    {
      request: {
        messages: [
          { role: 'user', content: 'Return exactly this JSON: {"ui":[]}' },
        ],
      },
      response: { content: '{"ui":[]}' },
    },
  ]);

  expect(fixtures.map((f) => f.match)).toEqual([
    { userMessage: 'Q', turnIndex: 0, hasToolResult: false },
    { userMessage: 'Q', turnIndex: 1, hasToolResult: true },
    {
      userMessage: 'Return exactly this JSON: {"ui":[]}',
      turnIndex: 0,
      hasToolResult: false,
    },
  ]);
});

test('scopes hasToolResult to the current turn, as aimock does', () => {
  const [fixture] = recordingsToFixtures([
    {
      request: {
        messages: [
          { role: 'user', content: 'Q1' },
          { role: 'assistant', content: '' },
          { role: 'tool', content: '{}' },
          { role: 'assistant', content: 'A1' },
          { role: 'user', content: 'Q2' },
        ],
      },
      response: { content: 'A2' },
    },
  ]);

  expect(fixture.match).toEqual({
    userMessage: 'Q2',
    turnIndex: 2,
    hasToolResult: false,
  });
});

test('sibling fixture path follows the b4 eval convention', () => {
  expect(
    siblingFixturePath(
      '/x/assistant.eval.ts',
      'Which GBP client is furthest behind?',
      3,
    ),
  ).toBe('/x/assistant.which-gbp-client-is-furthest-behind.fixtures.json');
  expect(siblingFixturePath('/x/assistant.eval.ts', undefined, 3)).toBe(
    '/x/assistant.case-4.fixtures.json',
  );
});
