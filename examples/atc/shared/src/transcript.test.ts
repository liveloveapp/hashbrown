import { expect, test } from 'vitest';
import { transcriptItems } from './transcript';

const call = (name: string, status: 'pending' | 'done' = 'done') => ({
  name,
  args: {},
  status,
});
const ui = { ui: [{ Markdown: {} }] };

test('consecutive tool-only assistant messages fold into one chip row', () => {
  const messages = [
    { role: 'user', content: 'Seattle?' },
    { role: 'assistant', toolCalls: [call('findAircraft')] },
    { role: 'assistant', toolCalls: [call('highlightAircraft')] },
    { role: 'assistant', toolCalls: [call('lookupRoute', 'pending')] },
  ];

  const items = transcriptItems(messages);

  expect(items).toEqual([
    { kind: 'user', text: 'Seattle?' },
    {
      kind: 'tools',
      calls: [
        call('findAircraft'),
        call('highlightAircraft'),
        call('lookupRoute', 'pending'),
      ],
    },
  ]);
});

test('an answer ends a chip row, and later tools start a new one', () => {
  const answer = { role: 'assistant', toolCalls: [call('a')], content: ui };
  const messages = [
    { role: 'user', content: 'Hi' },
    { role: 'assistant', toolCalls: [call('find')] },
    answer,
    { role: 'assistant', toolCalls: [call('b')] },
  ];

  const items = transcriptItems(messages);

  expect(items).toEqual([
    { kind: 'user', text: 'Hi' },
    { kind: 'tools', calls: [call('find'), call('a')] },
    { kind: 'answer', message: answer },
    { kind: 'tools', calls: [call('b')] },
  ]);
});

test('a user message ends a chip row', () => {
  const messages = [
    { role: 'assistant', toolCalls: [call('a')] },
    { role: 'user', content: 'Next' },
    { role: 'assistant', toolCalls: [call('b')] },
  ];

  const kinds = transcriptItems(messages).map((item) => item.kind);

  expect(kinds).toEqual(['tools', 'user', 'tools']);
});

test('empty assistant messages, errors and non-text user content are skipped or blank', () => {
  const messages = [
    { role: 'user', content: [{ type: 'image' }] },
    { role: 'assistant', toolCalls: [], content: { ui: [] } },
    { role: 'assistant' },
    { role: 'error', content: 'boom' },
  ];

  const items = transcriptItems(messages);

  expect(items).toEqual([{ kind: 'user', text: '' }]);
});

test('transcriptItems does not mutate the messages', () => {
  const first = { role: 'assistant', toolCalls: [call('a')] };
  const messages = [first, { role: 'assistant', toolCalls: [call('b')] }];

  transcriptItems(messages);

  expect(first.toolCalls).toEqual([call('a')]);
});
