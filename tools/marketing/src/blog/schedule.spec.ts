import { expect, test } from 'vitest';

import { blogScheduleIssue } from './schedule.ts';

const SLOT = new Date('2026-11-04T15:00:00Z');
const file = (front: string) => `---\ntitle: T\n${front}\n---\n\nBody`;

test('accepts published with publishAt at the slot in any offset', () => {
  expect(
    blogScheduleIssue(
      file("published: true\npublishAt: '2026-11-04T10:00:00-05:00'"),
      SLOT,
    ),
  ).toBeUndefined();
});

test('flags a missing published flag', () => {
  expect(
    blogScheduleIssue(file("publishAt: '2026-11-04T15:00:00Z'"), SLOT),
  ).toMatchObject({
    rule: 'blog_schedule',
    message: expect.stringContaining('published: true'),
  });
});

test('flags a missing or offset-less publishAt', () => {
  for (const front of [
    'published: true',
    "published: true\npublishAt: '2026-11-04T10:00:00'",
  ]) {
    expect(blogScheduleIssue(file(front), SLOT)?.message).toContain(
      'publishAt with an offset at the slot (2026-11-04T15:00:00.000Z)',
    );
  }
});

test('flags a publishAt that is not the slot', () => {
  expect(
    blogScheduleIssue(
      file("published: true\npublishAt: '2026-11-04T16:00:00Z'"),
      SLOT,
    )?.message,
  ).toBe(
    'Blog publishAt 2026-11-04T16:00:00.000Z is not the slot 2026-11-04T15:00:00.000Z.',
  );
});
