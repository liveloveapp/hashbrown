import { expect, test } from 'vitest';
import { createAimock } from '@b4run/testing';
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
    { userMessage: 'Q', turnIndex: 0, hasToolResult: false, sequenceIndex: 0 },
    { userMessage: 'Q', turnIndex: 1, hasToolResult: true, sequenceIndex: 0 },
    {
      userMessage: 'Return exactly this JSON: {"ui":[]}',
      turnIndex: 0,
      hasToolResult: false,
      sequenceIndex: 0,
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
    sequenceIndex: 0,
  });
});

test('the judge request falls through to its own recording once the app has consumed its fixture', async () => {
  // Both are first-turn requests with no tool result, and the judge's user
  // message quotes the case input, so on substring matching the app's
  // fixture is a candidate for both.
  const judgePrompt = 'Criteria: be strict. Input: Q. Output: two.';
  const fixtures = recordingsToFixtures([
    {
      request: { messages: [{ role: 'user', content: 'Q' }] },
      response: { content: 'app answer' },
    },
    {
      request: {
        messages: [
          { role: 'system', content: 'You are a strict grader.' },
          { role: 'user', content: judgePrompt },
        ],
      },
      response: { content: '{"score":1,"reason":"fine"}' },
    },
  ]);
  const aimock = await createAimock({ fixtures });
  const complete = async (content: string) => {
    const res = await fetch(`${aimock.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        messages: [{ role: 'user', content }],
      }),
    });
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return json.choices?.[0]?.message?.content;
  };
  try {
    expect(await complete('Q')).toBe('app answer');
    expect(await complete(judgePrompt)).toBe('{"score":1,"reason":"fine"}');
  } finally {
    await aimock.close();
  }
}, 30_000);

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
