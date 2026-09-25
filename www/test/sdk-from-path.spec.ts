import { expect, test } from 'vitest';
import { sdkFromPath } from '../src/lib/site-config';

test('reads the SDK from docs and API paths like the Angular ConfigService', () => {
  const angular = sdkFromPath('/docs/angular/start/intro');
  const react = sdkFromPath('/api/react/useChat');

  expect(angular).toBe('angular');
  expect(react).toBe('react');
});

test('returns undefined for paths without an SDK', () => {
  const blog = sdkFromPath('/blog/2026-09-23-hashbrown-v-0-6-0');

  expect(blog).toBeUndefined();
});

test('checks angular first, as the Angular service did', () => {
  const both = sdkFromPath('/blog/angular-and-react');

  expect(both).toBe('angular');
});
