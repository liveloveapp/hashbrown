import { expect, test } from 'vitest';

import { renderInternalNotificationSummary } from './templates.ts';

const ORIGIN = 'https://hashbrown.dev';
const CONTACT = '3f1c7a52-9d3e-4b8a-8c11-0a1b2c3d4e5f';

function stopUrl(origin = ORIGIN, payloadOverride?: object): string {
  const payload = Buffer.from(
    JSON.stringify(
      payloadOverride ?? { c: CONTACT, i: 1, k: 1, p: 'founder_stop' },
    ),
  ).toString('base64url');
  const signature = Buffer.alloc(32, 7).toString('base64url');
  return `${origin}/_/growth/stop?token=g1.${payload}.${signature}`;
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    scoreVersion: 'growth-score-policy:v1',
    scoreReasons: [{ code: 'milestone.started', points: 15 }],
    submission: {
      messagePresent: true,
      messageLength: 40,
      message: 'My stream stops after\u0000 the first\rtool call.',
    },
    drafts: [
      { subject: 'One', body: 'First body.' },
      { subject: 'Two', body: 'Second body.' },
      { subject: 'Three', body: 'Third body.' },
    ],
    founderStopUrl: stopUrl(),
    origin: ORIGIN,
    ...overrides,
  };
}

test('internal notification embeds the bounded message, three draft previews and a canonical founder stop URL only', () => {
  const summary = renderInternalNotificationSummary(input());

  expect(summary).toContain('> My stream stops after the first');
  expect(summary).not.toContain('\u0000');
  expect(summary).toContain('Draft 3 — Three');
  expect(summary).toContain(stopUrl());
  expect(summary).not.toContain('Framework:');
  expect(summary.match(/https?:\/\//gu)).toHaveLength(1);
});

test('internal notification bounds the quoted message at 1000 characters', () => {
  const long = 'a'.repeat(1_500);

  const summary = renderInternalNotificationSummary(
    input({
      submission: {
        messagePresent: true,
        messageLength: 1_000,
        message: long,
      },
    }),
  );

  expect(summary).toContain(`> ${'a'.repeat(1_000)}`);
  expect(summary).not.toContain('a'.repeat(1_001));
});

test('internal notification rejects a non-canonical stop URL, other origins and the wrong draft count', () => {
  const wrongPurpose = stopUrl(ORIGIN, {
    c: CONTACT,
    i: 1,
    k: 1,
    p: 'unsubscribe',
  });
  const otherOrigin = stopUrl('https://evil.example');
  const shortSignature = `${ORIGIN}/_/growth/stop?token=g1.e30.abc`;

  expect(() =>
    renderInternalNotificationSummary(input({ founderStopUrl: wrongPurpose })),
  ).toThrow();
  expect(() =>
    renderInternalNotificationSummary(input({ founderStopUrl: otherOrigin })),
  ).toThrow();
  expect(() =>
    renderInternalNotificationSummary(
      input({ founderStopUrl: shortSignature }),
    ),
  ).toThrow();
  expect(() =>
    renderInternalNotificationSummary(input({ drafts: [] })),
  ).toThrow();
});
