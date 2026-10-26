import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

const privacy = readFileSync(
  resolve(import.meta.dirname, '../../content/privacy.md'),
  'utf8',
);

test('privacy explains support form information, email and contact choices', () => {
  const text = privacy;

  expect(text).toContain('[Get unstuck form](/unstuck)');
  expect(text).toContain('your email address and your question');
  expect(text).not.toMatch(/framework|agreement/i);
  expect(text).toContain('three emails');
  expect(text).toContain('unsubscribe link');
  expect(text).toContain('mailto:brian@hashbrown.dev');
  expect(text).not.toMatch(
    /telemetry|observability|collector|install digest|installation-id|DO_NOT_TRACK|PostHog/i,
  );
});
