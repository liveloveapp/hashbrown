import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

const privacy = readFileSync(
  resolve(import.meta.dirname, '../../content/privacy.md'),
  'utf8',
);

test('privacy describes the form, the install digest and install-runtime approval as live', () => {
  const text = privacy;

  expect(text).not.toMatch(/upcoming|When the Get unstuck form launches/i);
  expect(text).not.toMatch(/tracking/i);
  expect(text).toContain('[Get unstuck form](/unstuck)');
  expect(text).toContain(
    'your email address, your framework, and your question',
  );
  expect(text).toContain('founder install digest');
  expect(text).toContain('work domain');
  expect(text).toContain('gmail.com');
  expect(text).toContain('three emails');
  expect(text).toContain('unsubscribe link');
});
