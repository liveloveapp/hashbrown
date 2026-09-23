import { expect, test, vi } from 'vitest';
import { trackEvent } from './AnalyticsService';

test('sends the event to Fathom when it is loaded', () => {
  const fathom = { trackEvent: vi.fn() };

  trackEvent('install-copied-react', { fathom });

  expect(fathom.trackEvent).toHaveBeenCalledWith('install-copied-react');
});

test('does nothing when Fathom is not loaded', () => {
  const target = {};

  const act = () => trackEvent('install-copied-react', target);

  expect(act).not.toThrow();
});

test('does nothing when there is no window', () => {
  const act = () => trackEvent('install-copied-react', undefined);

  expect(act).not.toThrow();
});
