// @vitest-environment jsdom
import posthog from 'posthog-js';
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { DocsPageViewSignal } from '../../src/components/docs/DocsPageViewSignal';

vi.mock('posthog-js', () => ({ default: { capture: vi.fn(), init: vi.fn() } }));

const navigation = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

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
  try {
    navigation.pathname = '/docs/angular/start/intro';

    act(() => root.render(<DocsPageViewSignal sdk="angular" />));
    act(() => root.render(<DocsPageViewSignal sdk="angular" />));
    navigation.pathname = '/docs/angular/concept/components';
    act(() => root.render(<DocsPageViewSignal sdk="angular" />));

    expect(pageViews()).toEqual([
      { pathname: '/docs/angular/start/intro', framework: 'angular' },
      { pathname: '/docs/angular/concept/components', framework: 'angular' },
    ]);
  } finally {
    act(() => root.unmount());
  }
});

test('DocsPageViewSignal fires once under StrictMode double effects', () => {
  const root = createRoot(document.createElement('div'));
  try {
    navigation.pathname = '/docs/react/start/intro';

    act(() =>
      root.render(
        <StrictMode>
          <DocsPageViewSignal sdk="react" />
        </StrictMode>,
      ),
    );

    expect(pageViews()).toEqual([
      { pathname: '/docs/react/start/intro', framework: 'react' },
    ]);
  } finally {
    act(() => root.unmount());
  }
});
