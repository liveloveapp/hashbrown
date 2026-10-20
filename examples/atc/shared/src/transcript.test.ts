import { expect, test } from 'vitest';
import {
  chatStatus,
  messageText,
  thinkingStatus,
  transcriptItems,
} from './transcript';

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

test('thinkingStatus shows while the assistant works with nothing else on screen saying so', () => {
  const asked = transcriptItems([{ role: 'user', content: 'Seattle?' }]);
  const running = transcriptItems([
    { role: 'user', content: 'Seattle?' },
    { role: 'assistant', toolCalls: [call('findAircraft', 'pending')] },
  ]);
  const ranTools = transcriptItems([
    { role: 'user', content: 'Seattle?' },
    { role: 'assistant', toolCalls: [call('findAircraft')] },
  ]);
  const answering = transcriptItems([
    { role: 'user', content: 'Seattle?' },
    { role: 'assistant', content: ui },
  ]);

  const statuses = [
    thinkingStatus(asked, true),
    thinkingStatus(running, true),
    thinkingStatus(ranTools, true),
    thinkingStatus(answering, true),
    thinkingStatus(asked, false),
  ];

  expect(statuses).toEqual(['Thinking…', null, 'Thinking…', null, null]);
});

test('chatStatus says what the assistant is doing now: the running step, else thinking', () => {
  const asked = transcriptItems([{ role: 'user', content: 'Seattle?' }]);
  const following = transcriptItems([
    { role: 'user', content: 'Follow it' },
    {
      role: 'assistant',
      toolCalls: [
        { name: 'followAircraft', args: { hex: 'a1b2c3' }, status: 'pending' },
      ],
    },
  ]);
  const ranTools = transcriptItems([
    { role: 'user', content: 'Seattle?' },
    { role: 'assistant', toolCalls: [call('findAircraft')] },
  ]);
  const labelFor = () => 'UAL1802';

  const statuses = [
    chatStatus(asked, true, labelFor),
    chatStatus(following, true, labelFor),
    chatStatus(ranTools, true, labelFor),
    chatStatus(following, false, labelFor),
    chatStatus([], true),
  ];

  expect(statuses).toEqual([
    'Thinking…',
    'Following UAL1802…',
    'Thinking…',
    null,
    null,
  ]);
});

test('messageText reads string content and ignores anything else', () => {
  const texts = [
    messageText('hello'),
    messageText([{ type: 'text', text: 'x' }]),
    messageText(undefined),
  ];

  expect(texts).toEqual(['hello', '', '']);
});

test("puts an assistant message's reasoning before its tool calls", () => {
  const messages = [
    { role: 'user', content: 'Highest?' },
    {
      role: 'assistant',
      reasoning: 'Comparing altitudes.',
      toolCalls: [call('findAircraft', 'pending')],
    },
  ];

  const items = transcriptItems(messages, true);

  expect(items).toEqual([
    { kind: 'user', text: 'Highest?' },
    { kind: 'reasoning', text: 'Comparing altitudes.', done: true },
    { kind: 'tools', calls: [call('findAircraft', 'pending')] },
  ]);
});

test('merges adjacent reasoning and starts a new row after tool chips', () => {
  const answer = { role: 'assistant', reasoning: 'Answering.', content: ui };
  const messages = [
    { role: 'user', content: 'Highest?' },
    { role: 'assistant', reasoning: 'Looking.' },
    { role: 'assistant', reasoning: 'Still looking.', toolCalls: [call('a')] },
    { role: 'assistant', reasoning: '', toolCalls: [call('b')] },
    { role: 'assistant', reasoning: 'Comparing.', toolCalls: [call('c')] },
    answer,
    { role: 'user', content: 'Lowest?' },
    { role: 'assistant', reasoning: 'Again.' },
  ];

  const items = transcriptItems(messages);

  expect(items).toEqual([
    { kind: 'user', text: 'Highest?' },
    { kind: 'reasoning', text: 'Looking.\n\nStill looking.', done: true },
    { kind: 'tools', calls: [call('a'), call('b')] },
    { kind: 'reasoning', text: 'Comparing.', done: true },
    { kind: 'tools', calls: [call('c')] },
    { kind: 'reasoning', text: 'Answering.', done: true },
    { kind: 'answer', message: answer },
    { kind: 'user', text: 'Lowest?' },
    { kind: 'reasoning', text: 'Again.', done: true },
  ]);
});

test("a later call's reasoning streams live after finished tool chips", () => {
  const messages = [
    { role: 'user', content: 'Highest?' },
    { role: 'assistant', reasoning: 'Looking.', toolCalls: [call('a')] },
    { role: 'assistant', reasoning: 'Comparing.' },
  ];

  const items = transcriptItems(messages, true);
  const thinking = thinkingStatus(items, true);

  expect(items.slice(1)).toEqual([
    { kind: 'reasoning', text: 'Looking.', done: true },
    { kind: 'tools', calls: [call('a')] },
    { kind: 'reasoning', text: 'Comparing.', done: false },
  ]);
  expect(thinking).toBeNull();
});

test('marks reasoning done once a later row exists or the chat is idle', () => {
  const streaming = [
    { role: 'user', content: 'Highest?' },
    { role: 'assistant', reasoning: 'Comparing.' },
  ];
  const answered = [...streaming, { role: 'assistant', content: ui }];

  const done = [
    transcriptItems(streaming, true)[1],
    transcriptItems(streaming, false)[1],
    transcriptItems(streaming)[1],
    transcriptItems(answered, true)[1],
  ];

  expect(done).toEqual([
    { kind: 'reasoning', text: 'Comparing.', done: false },
    { kind: 'reasoning', text: 'Comparing.', done: true },
    { kind: 'reasoning', text: 'Comparing.', done: true },
    { kind: 'reasoning', text: 'Comparing.', done: true },
  ]);
});

test('hides the thinking line but announces reasoning while it streams', () => {
  const messages = [
    { role: 'user', content: 'Highest?' },
    { role: 'assistant', reasoning: 'Comparing.' },
  ];
  const streaming = transcriptItems(messages, true);
  const idle = transcriptItems(messages, false);

  const statuses = [
    thinkingStatus(streaming, true),
    chatStatus(streaming, true),
    chatStatus(idle, false),
  ];

  expect(statuses).toEqual([null, 'Reasoning…', null]);
});
