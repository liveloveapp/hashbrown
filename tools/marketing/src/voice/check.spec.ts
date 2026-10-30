import { expect, test } from 'vitest';

import type { MarketingChannel, PostKind, Source } from '../queue/types.ts';
import type { QueueDraft } from '../queue/types.ts';
import { BANNED_PHRASES } from './banned.ts';
import { checkVoice, type VoiceIssue } from './check.ts';

const SOURCE: Source = {
  url: 'https://github.com/liveloveapp/hashbrown/pull/1',
  note: 'the PR',
};

function check(
  draft: QueueDraft,
  opts: {
    channel?: MarketingChannel;
    kind?: PostKind;
    sources?: Source[];
    body?: string;
  } = {},
): VoiceIssue[] {
  return checkVoice({
    channel: opts.channel ?? draft.channel,
    kind: opts.kind ?? 'take',
    draft,
    sources: opts.sources ?? [SOURCE],
    body: opts.body,
  });
}

function rules(issues: VoiceIssue[]): string[] {
  return issues.map((issue) => issue.rule);
}

function x(text: string): QueueDraft {
  return { channel: 'x', text };
}

test("a clean post in Brian's voice has no issues", () => {
  const issues = check(
    x(
      'spent the morning wiring decisions into the atc demo. pretty happy with how small the diff ended up',
    ),
  );
  expect(issues).toEqual([]);
});

test('flags an em dash', () => {
  expect(rules(check(x('shipped it — finally')))).toEqual(['em_dash']);
});

test('flags an en dash used as a dash between spaces, not in a range', () => {
  expect(rules(check(x('shipped it – finally')))).toEqual(['em_dash']);
  expect(check(x('pages 3–5 are done'))).toEqual([]);
});

test('allows a plain hyphen and a spaced hyphen', () => {
  expect(check(x('shipped it - finally, and a well-known fix'))).toEqual([]);
});

test('flags a hashtag but not an issue number or a url fragment', () => {
  expect(rules(check(x('shipped #hashbrown today')))).toEqual(['hashtag']);
  expect(
    check(x('fixed #1234 see https://hashbrown.dev/docs#install')),
  ).toEqual([]);
});

test('allows one emoji and flags two', () => {
  expect(check(x('shipped it \u{1F44D}'))).toEqual([]);
  expect(rules(check(x('shipped it \u{1F44D} \u{1F525}')))).toEqual(['emoji']);
});

test('counts a joined emoji sequence as one emoji', () => {
  expect(check(x('the whole crew \u{1F468}‍\u{1F469}‍\u{1F467}'))).toEqual([]);
});

test('counts emoji across every checked field', () => {
  const draft: QueueDraft = {
    channel: 'linkedin',
    text: 'a short note \u{1F44D}',
    firstComment: 'link below \u{1F525}',
  };
  expect(rules(check(draft))).toEqual(['emoji']);
});

test('flags every banned word and phrase, case-insensitively', () => {
  expect(BANNED_PHRASES.length).toBeGreaterThan(10);
  for (const phrase of BANNED_PHRASES) {
    const issues = check(x(`we ${phrase.toUpperCase()} here`));
    expect(rules(issues), phrase).toContain('banned_phrase');
  }
});

test('matches banned words on word boundaries only', () => {
  expect(check(x('a landscaper and an unlockable door'))).toEqual([]);
  expect(rules(check(x('we should leverage it')))).toEqual(['banned_phrase']);
});

test('matches multi-word phrases across newlines and curly apostrophes', () => {
  expect(rules(check(x('here’s\nthe   thing about it')))).toEqual([
    'banned_phrase',
  ]);
});

test('flags the "not X but Y" and "it\'s not just X" cadences', () => {
  expect(rules(check(x('it is not a library but a habit')))).toEqual([
    'banned_phrase',
  ]);
  expect(rules(check(x("it's not just a library")))).toEqual(['banned_phrase']);
  expect(check(x("i'm not sure, but it works"))).toEqual([]);
});

test('names the offending phrase in the message', () => {
  const [issue] = check(x('we delve into it'));
  expect(issue.message).toContain('delve');
});

test('flags X text over 280 characters as a length issue without throwing', () => {
  const issues = check(x('a'.repeat(281)));
  expect(rules(issues)).toEqual(['length']);
});

test('flags a LinkedIn post over 3000 characters', () => {
  const draft: QueueDraft = { channel: 'linkedin', text: 'a'.repeat(3001) };
  expect(rules(check(draft))).toEqual(['length']);
});

test('flags a dev.to title over 128 characters', () => {
  const draft: QueueDraft = {
    channel: 'devto',
    blogSlug: 'a-post',
    article: { title: 'a'.repeat(129), tags: ['ai'], description: 'fine' },
  };
  expect(rules(check(draft))).toEqual(['length']);
});

test('flags an X thread part over 280 characters', () => {
  const draft: QueueDraft = {
    channel: 'x',
    threadParts: ['short', 'a'.repeat(281)],
  };
  expect(rules(check(draft))).toEqual(['length']);
});

test('allows one URL on X and flags two, counting the link field', () => {
  expect(check(x('read https://hashbrown.dev/blog/a'))).toEqual([]);
  expect(
    rules(check(x('read https://hashbrown.dev/a and https://hashbrown.dev/b'))),
  ).toEqual(['link']);
  const draft: QueueDraft = {
    channel: 'x',
    text: 'read https://hashbrown.dev/a',
    link: { url: 'https://hashbrown.dev/b' },
  };
  expect(rules(check(draft))).toEqual(['link']);
});

test('flags a URL in LinkedIn text but allows it in the first comment', () => {
  const inText: QueueDraft = {
    channel: 'linkedin',
    text: 'new post https://hashbrown.dev/blog/a',
  };
  expect(rules(check(inText))).toEqual(['link']);
  const inComment: QueueDraft = {
    channel: 'linkedin',
    text: 'new post',
    firstComment: 'https://hashbrown.dev/blog/a',
  };
  expect(check(inComment)).toEqual([]);
});

test('requires sources on every kind, including blog', () => {
  const blog: QueueDraft = { channel: 'blog', slug: 'a', title: 'A post' };
  expect(rules(check(blog, { kind: 'blog', sources: [] }))).toEqual([
    'no_sources',
  ]);
  expect(rules(check(x('fine'), { kind: 'release', sources: [] }))).toEqual([
    'no_sources',
  ]);
});

test('checks the blog title and body for dashes and banned phrases only', () => {
  const blog: QueueDraft = { channel: 'blog', slug: 'a', title: 'A post' };
  const issues = check(blog, {
    kind: 'blog',
    body: 'We delve in — then #tag \u{1F44D}\u{1F525} https://a.dev/1 https://a.dev/2',
  });
  expect(rules(issues).sort()).toEqual(['banned_phrase', 'em_dash']);
  expect(
    rules(
      check({ ...blog, title: 'Seamless — tags #x' }, { kind: 'blog' }),
    ).sort(),
  ).toEqual(['banned_phrase', 'em_dash', 'hashtag']);
});

test('checks the dev.to title and description', () => {
  const draft: QueueDraft = {
    channel: 'devto',
    blogSlug: 'a-post',
    article: { title: 'A post', tags: ['ai'], description: 'a robust thing' },
  };
  expect(rules(check(draft))).toEqual(['banned_phrase']);
});

test('reports each field that breaks a rule', () => {
  const draft: QueueDraft = {
    channel: 'x',
    threadParts: ['one — two', 'three — four'],
  };
  expect(rules(check(draft))).toEqual(['em_dash', 'em_dash']);
});
