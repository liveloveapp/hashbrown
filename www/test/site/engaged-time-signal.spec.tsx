// @vitest-environment jsdom
import posthog from 'posthog-js';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { EngagedTimeSignal } from '../../src/components/site/EngagedTimeSignal';

vi.mock('posthog-js', () => ({ default: { capture: vi.fn(), init: vi.fn() } }));

const navigation = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function engagedSeconds() {
  return vi
    .mocked(posthog.capture)
    .mock.calls.filter(([event]) => event === 'marketing:engaged_time')
    .map(([, props]) => props?.engaged_seconds);
}

test('fires at 10 and 30 seconds of visible time, once each', () => {
  navigation.pathname = '/';
  vi.useFakeTimers();
  const root = createRoot(document.createElement('div'));
  try {
    act(() => root.render(<EngagedTimeSignal />));

    act(() => vi.advanceTimersByTime(9_000));
    const before = engagedSeconds();
    act(() => vi.advanceTimersByTime(60_000));

    expect(before).toEqual([]);
    expect(engagedSeconds()).toEqual([10, 30]);
  } finally {
    act(() => root.unmount());
    vi.useRealTimers();
  }
});

test('engaged time restarts on pathname change', () => {
  navigation.pathname = '/';
  vi.useFakeTimers();
  const root = createRoot(document.createElement('div'));
  try {
    act(() => root.render(<EngagedTimeSignal />));
    act(() => vi.advanceTimersByTime(10_000));

    navigation.pathname = '/docs/react/start/intro';
    act(() => root.render(<EngagedTimeSignal />));
    act(() => vi.advanceTimersByTime(9_000));
    const beforeSecondThreshold = engagedSeconds();
    act(() => vi.advanceTimersByTime(1_000));

    expect(beforeSecondThreshold).toEqual([10]);
    expect(engagedSeconds()).toEqual([10, 10]);
  } finally {
    act(() => root.unmount());
    vi.useRealTimers();
  }
});
