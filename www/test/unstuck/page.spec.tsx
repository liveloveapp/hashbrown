// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import UnstuckPage, { dynamic, metadata } from '../../src/app/unstuck/page';
import { UNSTUCK_FALLBACK_ADDRESS } from '../../src/lib/growth/form-route';

vi.mock('../../src/components/site/Header', () => ({
  Header: () => <header />,
}));
vi.mock('../../src/components/site/Footer', () => ({
  Footer: () => <footer />,
}));
vi.mock('posthog-js', () => ({ default: { capture: vi.fn(), init: vi.fn() } }));

test('switch off renders the fallback and no form', () => {
  vi.stubEnv('GROWTH_UNSTUCK_FORM_ENABLED', 'false');

  cleanup();
  render(<UnstuckPage />);

  expect(
    screen
      .getByRole('link', { name: UNSTUCK_FALLBACK_ADDRESS })
      .getAttribute('href'),
  ).toBe(`mailto:${UNSTUCK_FALLBACK_ADDRESS}`);
  expect(screen.getByText(/Write to Brian at/)).toBeTruthy();
  expect(document.querySelector('form')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Send to Brian' })).toBeNull();
});

test('switch on renders the form', () => {
  vi.stubEnv('GROWTH_UNSTUCK_FORM_ENABLED', 'true');

  cleanup();
  render(<UnstuckPage />);

  expect(document.querySelector('form')).not.toBeNull();
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
    'Stuck? Ask Brian.',
  );
});

test('the page is dynamic and titled', () => {
  expect(dynamic).toBe('force-dynamic');
  expect(String(metadata.title)).toBe('Get unstuck: Hashbrown');
});
