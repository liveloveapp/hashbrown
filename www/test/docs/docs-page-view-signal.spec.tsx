// @vitest-environment jsdom
import posthog from 'posthog-js';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import { DocsPageViewSignal } from '../../src/components/docs/DocsPageViewSignal';

vi.mock('posthog-js', () => ({ default: { capture: vi.fn(), init: vi.fn() } }));

const navigation = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.mocked(posthog.capture).mockReset();
  navigation.pathname = '/';
});

function pageViews() {
  return vi
    .mocked(posthog.capture)
    .mock.calls.filter(([event]) => event === 'docs:page_viewed')
    .map(([, props]) => ({
      pathname: props?.pathname,
      framework: props?.framework,
    }));
}

test('DocsPageViewSignal fires docs:page_viewed once per pathname with the framework', () => {
  const root = createRoot(document.createElement('div'));
  navigation.pathname = '/docs/angular/start/intro';

  act(() => root.render(<DocsPageViewSignal sdk="angular" />));
  act(() => root.render(<DocsPageViewSignal sdk="angular" />));
  navigation.pathname = '/docs/angular/concept/components';
  act(() => root.render(<DocsPageViewSignal sdk="angular" />));

  expect(pageViews()).toEqual([
    { pathname: '/docs/angular/start/intro', framework: 'angular' },
    { pathname: '/docs/angular/concept/components', framework: 'angular' },
  ]);
  act(() => root.unmount());
});
