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

test('switch on renders the headline, the lede and the form', () => {
  vi.stubEnv('GROWTH_UNSTUCK_FORM_ENABLED', 'true');

  cleanup();
  render(<UnstuckPage />);

  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
    'Stuck? Tell me where.',
  );
  expect(
    screen.getByText(
      "I'm Brian, founder of Hashbrown. I'd love to help you, engineer to engineer.",
    ),
  ).toBeTruthy();
  expect(screen.getByLabelText('Your email')).toBeTruthy();
});

test('switch off renders only the fallback line, no fields and no second email link', () => {
  vi.stubEnv('GROWTH_UNSTUCK_FORM_ENABLED', 'false');

  cleanup();
  render(<UnstuckPage />);

  const link = screen.getByRole('link', { name: UNSTUCK_FALLBACK_ADDRESS });
  expect(link.getAttribute('href')).toBe(`mailto:${UNSTUCK_FALLBACK_ADDRESS}`);
  expect(link.closest('p')?.textContent).toBe(
    'Email me at brian@hashbrown.dev.',
  );
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(document.querySelector('form')).toBeNull();
  expect(document.querySelectorAll('a[href^="mailto:"]')).toHaveLength(1);
});

test('the page is dynamic, titled and described in Brian’s voice', () => {
  expect(dynamic).toBe('force-dynamic');
  expect(metadata.title).toEqual({ absolute: 'Get unstuck: Hashbrown' });
  expect(metadata.description).toBe(
    'Stuck building with Hashbrown? Tell me where.',
  );
});
