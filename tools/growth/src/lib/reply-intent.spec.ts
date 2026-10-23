import { expect, test } from 'vitest';

import { isStopRequest } from './reply-intent.ts';

test('explicit opt-out phrases are stop requests, in any case', () => {
  const replies = [
    'Unsubscribe',
    'please STOP',
    'Opt out please.',
    'opt-out',
    'Remove me from this list',
    'Take me off your list',
    'No more emails, thanks',
    "Don't email me again",
    'Do not contact me',
    'Not interested.',
  ];

  const results = replies.map((text) => isStopRequest({ text }));

  expect(results).toEqual(replies.map(() => true));
});

test('ordinary replies are not stop requests', () => {
  const replies = [
    'received',
    'Thanks! Quick question about streaming in Angular.',
    'This is unstoppable, nice work',
    'How do I remove the default theme?',
  ];

  const results = replies.map((text) => isStopRequest({ text }));

  expect(results).toEqual(replies.map(() => false));
});

test('only the new text counts, not the quoted message below it', () => {
  const text = [
    'Got it, thanks.',
    '',
    'On Thu, Oct 23, 2026 at 3:00 AM Brian <brian@hashbrown.dev> wrote:',
    '> Reply STOP or unsubscribe anytime.',
  ].join('\n');

  const result = isStopRequest({ text });

  expect(result).toBe(false);
});

test('quoted lines and forwarded originals are ignored', () => {
  const quoted = '> unsubscribe\nsounds good';
  const original = 'ok\n-----Original Message-----\nFrom: Brian\nunsubscribe';

  const results = [quoted, original].map((text) => isStopRequest({ text }));

  expect(results).toEqual([false, false]);
});

test('an html-only reply is read from its visible text', () => {
  const html =
    '<div>Please <b>unsubscribe</b> me</div><blockquote>thanks</blockquote>';

  const result = isStopRequest({ text: null, html });

  expect(result).toBe(true);
});

test('a reply with no readable text is treated as a stop request', () => {
  const result = isStopRequest({ text: '  ', html: null });

  expect(result).toBe(true);
});
