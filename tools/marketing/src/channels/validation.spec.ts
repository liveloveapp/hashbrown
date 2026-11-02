import { expect, test } from 'vitest';

import type { Draft } from './types.ts';
import { validateDraft, ValidationError } from './validation.ts';

function ruleOf(draft: Draft): string | undefined {
  try {
    validateDraft(draft);
  } catch (error) {
    return (error as ValidationError).rule;
  }
  return undefined;
}

test('validateDraft accepts a minimal X draft and exactly 280 code points', () => {
  expect(ruleOf({ channel: 'x', text: 'hello' })).toBeUndefined();
  expect(ruleOf({ channel: 'x', text: 'a'.repeat(280) })).toBeUndefined();
  expect(ruleOf({ channel: 'x', text: '😀'.repeat(280) })).toBeUndefined();
});

test('validateDraft rejects X text over 280 code points', () => {
  expect(ruleOf({ channel: 'x', text: 'a'.repeat(281) })).toBe('text-too-long');
});

test('validateDraft requires exactly one of text or threadParts on X', () => {
  expect(ruleOf({ channel: 'x', text: 'hi', threadParts: ['a', 'b'] })).toBe(
    'exclusive-text-thread',
  );
  expect(ruleOf({ channel: 'x' })).toBe('missing-text-or-thread');
});

test('validateDraft rejects short threads and over-long thread parts', () => {
  expect(ruleOf({ channel: 'x', threadParts: ['only one'] })).toBe(
    'thread-too-short',
  );
  expect(ruleOf({ channel: 'x', threadParts: ['ok', 'a'.repeat(281)] })).toBe(
    'thread-part-too-long',
  );
});

test('validateDraft rejects a draft whose channel is not the adapter channel', () => {
  expect(() =>
    validateDraft({ channel: 'linkedin', text: 'hi' }, { adapterId: 'x' }),
  ).toThrow(/Channel mismatch/);
});

test('validateDraft enforces the LinkedIn rules', () => {
  expect(
    ruleOf({ channel: 'linkedin', text: 'Read it: https://hashbrown.dev/a' }),
  ).toBe(undefined);
  expect(ruleOf({ channel: 'linkedin', text: '   ' })).toBe(
    'linkedin-text-required',
  );
  expect(ruleOf({ channel: 'linkedin', text: 'a'.repeat(3000) })).toBe(
    undefined,
  );
  expect(ruleOf({ channel: 'linkedin', text: 'a'.repeat(3001) })).toBe(
    'linkedin-text-too-long',
  );
  expect(ruleOf({ channel: 'linkedin', text: 'hi', threadParts: ['a'] })).toBe(
    'linkedin-no-threads',
  );
  expect(
    ruleOf({ channel: 'linkedin', text: 'hi', link: { url: 'https://a.b' } }),
  ).toBe('linkedin-no-link-preview');
  expect(ruleOf({ channel: 'linkedin', text: 'hi', firstComment: 'c' })).toBe(
    'linkedin-no-first-comment',
  );
  expect(ruleOf({ channel: 'linkedin', text: 'hi', firstComment: '' })).toBe(
    'linkedin-no-first-comment',
  );
});

const article = { title: 'A title', tags: ['angular'] };

test('validateDraft accepts a minimal dev.to draft with and without tags and canonical URL', () => {
  expect(ruleOf({ channel: 'devto', text: 'body', article })).toBeUndefined();
  expect(
    ruleOf({ channel: 'devto', text: 'body', article: { title: 'T' } }),
  ).toBeUndefined();
  expect(
    ruleOf({
      channel: 'devto',
      text: 'body',
      article: { ...article, canonicalUrl: 'https://hashbrown.dev/blog/x' },
    }),
  ).toBeUndefined();
});

test('validateDraft requires a dev.to body, article and 1-128 character title', () => {
  expect(ruleOf({ channel: 'devto', article })).toBe('devto-body-required');
  expect(ruleOf({ channel: 'devto', text: '', article })).toBe(
    'devto-body-required',
  );
  expect(ruleOf({ channel: 'devto', text: 'body' })).toBe(
    'devto-article-required',
  );
  expect(
    ruleOf({ channel: 'devto', text: 'body', article: { title: '' } }),
  ).toBe('devto-title-length');
  expect(
    ruleOf({
      channel: 'devto',
      text: 'body',
      article: { title: 'a'.repeat(129) },
    }),
  ).toBe('devto-title-length');
});

test('validateDraft limits dev.to tags to 4 lowercase alphanumeric words of at most 30 characters', () => {
  const withTags = (tags: string[]): Draft => ({
    channel: 'devto',
    text: 'body',
    article: { title: 'T', tags },
  });

  expect(ruleOf(withTags(['a', 'b', 'c', 'd', 'e']))).toBe(
    'devto-too-many-tags',
  );
  expect(ruleOf(withTags(['web-dev']))).toBe('devto-tag-format');
  expect(ruleOf(withTags(['Angular']))).toBe('devto-tag-format');
  expect(ruleOf(withTags(['snake_case']))).toBe('devto-tag-format');
  expect(ruleOf(withTags(['a'.repeat(31)]))).toBe('devto-tag-format');
});

test('validateDraft requires an https canonical URL and no thread on dev.to', () => {
  const withCanonical = (canonicalUrl: string): Draft => ({
    channel: 'devto',
    text: 'body',
    article: { title: 'T', canonicalUrl },
  });

  expect(ruleOf(withCanonical('http://hashbrown.dev/x'))).toBe(
    'devto-canonical-protocol',
  );
  expect(ruleOf(withCanonical('not a url'))).toBe('devto-canonical-invalid');
  expect(
    ruleOf({ channel: 'devto', text: 'body', article, threadParts: ['a'] }),
  ).toBe('devto-no-threads');
});
