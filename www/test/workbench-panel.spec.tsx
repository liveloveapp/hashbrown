// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import {
  hostedWorkbenchLessons,
  workbenchLessons,
} from '../examples/quickstart/runtime/workbench-lessons';
import { DOCS_DEMOS } from '../src/components/elements/docs-demo-media';
import { WorkbenchPanel } from '../src/components/workbench/WorkbenchPanel';
import { createEmbedClient } from '../src/components/workbench/embed-client';
import {
  assertWorkbenchLesson,
  LOOPBACK_LESSONS,
  WORKBENCH_LESSONS_WITHOUT_CAPTURE,
  workbenchLiveAvailability,
  workbenchMediaId,
  workbenchOrigin,
} from '../src/components/workbench/workbench-lessons';
import { workbenchMediaName } from '../src/components/workbench/workbench-media';

const origin = 'https://workbench.hashbrown.dev';
const capture = {
  version: 1,
  lesson: 'tools',
  framework: 'react',
  commit: 'abc',
  recordedAt: '2026-10-28T00:00:00.000Z',
  events: [],
};

/**
 * Stubs the browser APIs the panel reads and returns a trigger for the
 * intersection observer. Restores the previous test's render, stubs, env
 * and timers first, so a failed test cannot leak into the next one.
 */
function setup({ narrow = false, fakeTimers = false } = {}) {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  if (fakeTimers) vi.useFakeTimers();
  const observers: IntersectionObserverCallback[] = [];
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: narrow && query === '(max-width: 799px)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  vi.stubGlobal(
    'IntersectionObserver',
    vi.fn(function (this: unknown, callback: IntersectionObserverCallback) {
      observers.push(callback);
      return { observe: vi.fn(), disconnect: vi.fn(), unobserve: vi.fn() };
    }),
  );
  const fetchMock = vi.fn(
    async (): Promise<{ ok: boolean; json: () => Promise<unknown> }> => ({
      ok: true,
      json: async () => capture,
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  const intersect = () =>
    act(() =>
      observers.forEach((callback) =>
        callback(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          {} as IntersectionObserver,
        ),
      ),
    );
  return { fetchMock, intersect };
}

function liveTab() {
  return document.querySelectorAll('[role="tab"]')[1] as HTMLElement;
}

function replayFrame() {
  return document.querySelector<HTMLIFrameElement>(
    'iframe[src*="embed=replay"]',
  );
}

function spyOnFrame(frame: HTMLIFrameElement) {
  return vi
    .spyOn(frame.contentWindow as Window, 'postMessage')
    .mockImplementation(() => undefined);
}

async function fromFrame(
  frame: HTMLIFrameElement,
  data: unknown,
  overrides: { origin?: string; source?: Window | null } = {},
) {
  await act(async () => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data,
        origin: overrides.origin ?? origin,
        source:
          'source' in overrides
            ? overrides.source
            : (frame.contentWindow as Window),
      }),
    );
    for (let tick = 0; tick < 10; tick++) await Promise.resolve();
  });
}

const ready = {
  type: 'hb-workbench:ready',
  version: 1,
  mode: 'replay',
  lesson: 'tools',
  framework: 'react',
};
const loaded = {
  type: 'hb-workbench:loaded',
  version: 1,
  milestones: [],
  commit: 'abc',
};

test('renders nothing heavy until the panel nears the viewport', () => {
  const { intersect } = setup();
  render(<WorkbenchPanel lesson="tools" sdk="react" />);

  const before = document.querySelector('iframe');
  intersect();

  expect(before).toBeNull();
  expect(replayFrame()?.getAttribute('src')).toBe(
    `${origin}/react.html?lesson=tools&embed=replay`,
  );
  expect(replayFrame()?.getAttribute('title')).toBe(
    'Hashbrown workbench replay: Tools',
  );
  expect(vi.mocked(IntersectionObserver)).toHaveBeenCalledWith(
    expect.any(Function),
    { rootMargin: '200px' },
  );
});

test('a capture that takes longer than the load window still loads', async () => {
  const { fetchMock, intersect } = setup({ fakeTimers: true });
  fetchMock.mockImplementation(
    () =>
      new Promise((resolve) =>
        setTimeout(
          () => resolve({ ok: true, json: async () => capture }),
          9000,
        ),
      ),
  );
  render(<WorkbenchPanel lesson="tools" sdk="react" />);
  intersect();
  const frame = replayFrame() as HTMLIFrameElement;
  const post = spyOnFrame(frame);
  await fromFrame(frame, ready);

  await act(async () => {
    vi.advanceTimersByTime(9000);
    for (let tick = 0; tick < 10; tick++) await Promise.resolve();
  });
  act(() => vi.advanceTimersByTime(7999));

  expect(post).toHaveBeenCalledWith(
    { type: 'hb-workbench:load', version: 1, capture },
    origin,
  );
  expect(replayFrame()).not.toBeNull();
  expect(document.querySelector('video')).toBeNull();
});

test('a capture fetch that never settles falls back after 30 seconds', async () => {
  const { fetchMock, intersect } = setup({ fakeTimers: true });
  fetchMock.mockImplementation(() => new Promise(() => undefined));
  render(<WorkbenchPanel lesson="tools" sdk="react" />);
  intersect();
  const frame = replayFrame() as HTMLIFrameElement;
  spyOnFrame(frame);
  await fromFrame(frame, ready);

  act(() => vi.advanceTimersByTime(29999));
  const before = replayFrame();
  act(() => vi.advanceTimersByTime(1));

  expect(before).not.toBeNull();
  expect(replayFrame()).toBeNull();
  expect(document.querySelector('video')).not.toBeNull();
});

test('loads the capture into the replay frame after ready', async () => {
  const { fetchMock, intersect } = setup();
  render(<WorkbenchPanel lesson="tools" sdk="react" />);
  intersect();
  const frame = replayFrame() as HTMLIFrameElement;
  const post = spyOnFrame(frame);

  const fetchedBeforeReady = fetchMock.mock.calls.length;
  await fromFrame(frame, ready);

  expect(fetchedBeforeReady).toBe(0);
  expect(fetchMock).toHaveBeenCalledWith(
    '/video/docs/canonical-workbench-tools-react-capture.json',
    expect.anything(),
  );
  expect(post).toHaveBeenCalledWith(
    { type: 'hb-workbench:load', version: 1, capture },
    origin,
  );
});

test('reposts load on a second ready without fetching again', async () => {
  const { fetchMock, intersect } = setup();
  render(<WorkbenchPanel lesson="tools" sdk="react" />);
  intersect();
  const frame = replayFrame() as HTMLIFrameElement;
  const post = spyOnFrame(frame);

  await fromFrame(frame, ready);
  await fromFrame(frame, ready);

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledTimes(2);
});

test('falls back to the recorded video when ready never arrives', () => {
  const { intersect } = setup({ fakeTimers: true });
  render(<WorkbenchPanel lesson="tools" sdk="react" />);
  intersect();

  act(() => vi.advanceTimersByTime(7999));
  const before = replayFrame();
  act(() => vi.advanceTimersByTime(1));

  expect(before).not.toBeNull();
  expect(replayFrame()).toBeNull();
  expect(document.querySelector('video')).not.toBeNull();
});

test('falls back when the capture never finishes loading', async () => {
  const { intersect } = setup({ fakeTimers: true });
  render(<WorkbenchPanel lesson="tools" sdk="react" />);
  intersect();
  const frame = replayFrame() as HTMLIFrameElement;
  spyOnFrame(frame);
  await fromFrame(frame, ready);

  act(() => vi.advanceTimersByTime(7999));
  const before = replayFrame();
  act(() => vi.advanceTimersByTime(1));

  expect(before).not.toBeNull();
  expect(replayFrame()).toBeNull();
  expect(document.querySelector('video')).not.toBeNull();
});

test('keeps the replay once the capture has loaded', async () => {
  const { intersect } = setup({ fakeTimers: true });
  render(<WorkbenchPanel lesson="tools" sdk="react" />);
  intersect();
  const frame = replayFrame() as HTMLIFrameElement;
  spyOnFrame(frame);

  await fromFrame(frame, ready);
  await fromFrame(frame, loaded);
  act(() => vi.advanceTimersByTime(20000));

  expect(replayFrame()).not.toBeNull();
  expect(document.querySelector('video')).toBeNull();
});

test('falls back when the capture fetch fails', async () => {
  const { fetchMock, intersect } = setup();
  fetchMock.mockImplementation(async () => ({
    ok: false,
    json: async () => ({}),
  }));
  render(<WorkbenchPanel lesson="tools" sdk="react" />);
  intersect();
  const frame = replayFrame() as HTMLIFrameElement;
  spyOnFrame(frame);

  await fromFrame(frame, ready);

  expect(replayFrame()).toBeNull();
  expect(document.querySelector('video')).not.toBeNull();
});

test('falls back when the workbench rejects the capture', async () => {
  const { intersect } = setup();
  render(<WorkbenchPanel lesson="tools" sdk="react" />);
  intersect();
  const frame = replayFrame() as HTMLIFrameElement;
  spyOnFrame(frame);

  await fromFrame(frame, ready);
  await fromFrame(frame, {
    type: 'hb-workbench:rejected',
    version: 1,
    reason: 'lesson',
  });

  expect(replayFrame()).toBeNull();
  expect(document.querySelector('video')).not.toBeNull();
});

test('ignores messages from other origins or frames', async () => {
  const { fetchMock, intersect } = setup();
  render(<WorkbenchPanel lesson="tools" sdk="react" />);
  intersect();
  const frame = replayFrame() as HTMLIFrameElement;
  spyOnFrame(frame);

  await fromFrame(frame, ready, { origin: 'https://evil.example' });
  await fromFrame(frame, ready, { source: window });
  await fromFrame(
    frame,
    { type: 'hb-workbench:rejected', version: 1, reason: 'lesson' },
    { origin: 'https://evil.example' },
  );

  expect(fetchMock).not.toHaveBeenCalled();
  expect(replayFrame()).not.toBeNull();
});

test('the embed client dispatches only valid messages from its frame', () => {
  setup();
  const frame = document.createElement('iframe');
  document.body.append(frame);
  const handlers = {
    ready: vi.fn(),
    loaded: vi.fn(),
    rejected: vi.fn(),
    state: vi.fn(),
  };
  const client = createEmbedClient(frame, origin, handlers);
  const send = (data: unknown, from = origin) =>
    window.dispatchEvent(
      new MessageEvent('message', {
        data,
        origin: from,
        source: frame.contentWindow as Window,
      }),
    );

  send(ready);
  send(ready, 'https://evil.example');
  send({ ...ready, version: 2 });
  send({ type: 'other' });
  client.dispose();
  send(ready);

  expect(handlers.ready).toHaveBeenCalledTimes(1);
  expect(handlers.ready).toHaveBeenCalledWith(ready);
  frame.remove();
});

test('Live mounts a live frame only after the tab is clicked', () => {
  const { intersect } = setup();
  render(<WorkbenchPanel lesson="tools" sdk="angular" />);
  intersect();

  const before = document.querySelector('iframe[src*="embed=live"]');
  fireEvent.click(liveTab());

  expect(before).toBeNull();
  expect(
    document.querySelector('iframe[src*="embed=live"]')?.getAttribute('src'),
  ).toBe(`${origin}/angular.html?lesson=tools&embed=live`);
  expect(replayFrame()).not.toBeNull();
  expect(
    replayFrame()?.closest('[role="tabpanel"]')?.hasAttribute('hidden'),
  ).toBe(true);
});

test('the tabs are Replay and Live, with Source only when there is source', () => {
  setup();
  render(<WorkbenchPanel lesson="tools" sdk="react" />);
  const without = [...document.querySelectorAll('[role="tab"]')].map(
    (tab) => tab.textContent,
  );
  cleanup();

  render(
    <WorkbenchPanel
      lesson="tools"
      sdk="react"
      source={{ commit: 'abc', files: [] }}
    />,
  );
  const withSource = [...document.querySelectorAll('[role="tab"]')].map(
    (tab) => tab.textContent,
  );

  expect(without).toEqual(['Replay', 'Live']);
  expect(withSource).toEqual(['Replay', 'Live', 'Source']);
  expect(
    document.querySelector('[role="tab"]')?.getAttribute('aria-selected'),
  ).toBe('true');
});

test('arrow keys move between tabs', () => {
  setup();
  render(<WorkbenchPanel lesson="tools" sdk="react" />);
  const [replay, live] = document.querySelectorAll<HTMLElement>('[role="tab"]');

  fireEvent.keyDown(replay, { key: 'ArrowRight' });

  expect(live.getAttribute('aria-selected')).toBe('true');
  expect(document.activeElement).toBe(live);
});

test('loopback lessons link to running locally instead of Live', () => {
  const { intersect } = setup();
  render(<WorkbenchPanel lesson="server-threads" sdk="react" />);
  intersect();

  fireEvent.click(liveTab());

  expect(document.querySelector('iframe[src*="embed=live"]')).toBeNull();
  expect(document.body.textContent).toContain(
    'This lesson runs only on a local server',
  );
  expect(
    document.querySelector(
      'a[href="/docs/react/start/workbench#run-the-example"]',
    ),
  ).not.toBeNull();
});

test('production-recovery links to the b4run reference instead of Live', () => {
  const { intersect } = setup();
  render(<WorkbenchPanel lesson="production-recovery" sdk="angular" />);
  intersect();

  fireEvent.click(liveTab());

  expect(document.querySelector('iframe[src*="embed=live"]')).toBeNull();
  expect(document.body.textContent).toContain(
    'This lesson runs only on a local server',
  );
  expect(
    document.querySelector('a[href="/docs/angular/platform/b4run"]'),
  ).not.toBeNull();
});

test.each([false, true])(
  'production-recovery renders no hosted workbench link (narrow: %s)',
  (narrow) => {
    const { intersect } = setup({ narrow });
    render(<WorkbenchPanel lesson="production-recovery" sdk="react" />);
    intersect();

    if (!narrow) fireEvent.click(liveTab());

    expect(document.querySelector('video')).not.toBeNull();
    expect(document.querySelector(`a[href^="${origin}"]`)).toBeNull();
    expect(document.body.textContent).not.toContain('Open full workbench');
  },
);

test.each([false, true])(
  'loopback lessons keep their hosted open link (narrow: %s)',
  (narrow) => {
    const { intersect } = setup({ narrow });
    render(<WorkbenchPanel lesson="public-endpoint" sdk="angular" />);
    intersect();

    const link = document.querySelector(
      `a[href="${origin}/angular.html?lesson=public-endpoint"]`,
    );

    expect(link?.textContent).toContain('Open full workbench');
  },
);

test('every lesson is either live on the hosted workbench or links to a local run', () => {
  const hosted = new Set(hostedWorkbenchLessons.map((lesson) => lesson.id));

  const availability = workbenchLessons.map((lesson) => ({
    lesson,
    react: workbenchLiveAvailability(lesson.id, 'react'),
  }));

  for (const { lesson, react } of availability) {
    const live = hosted.has(lesson.id) && !LOOPBACK_LESSONS.includes(lesson.id);
    expect(react.live, lesson.id).toBe(live);
    if (react.live) continue;
    expect(react.href, lesson.id).toBe(
      lesson.host === 'production-reference'
        ? '/docs/react/platform/b4run'
        : '/docs/react/start/workbench#run-the-example',
    );
  }
  expect(workbenchLiveAvailability('production-recovery', 'react')).toEqual({
    live: false,
    href: '/docs/react/platform/b4run',
  });
  expect(workbenchLiveAvailability('tools', 'react')).toEqual({ live: true });
});

test('narrow viewports get the video and an open link', () => {
  setup({ narrow: true });
  render(<WorkbenchPanel lesson="structured-output" sdk="react" />);

  const video = document.querySelector('video');

  expect(document.querySelector('iframe')).toBeNull();
  expect(video?.getAttribute('poster')).toBe(
    '/video/docs/canonical-workbench-structured-react-poster.png',
  );
  expect(
    document.querySelector(
      `a[href="${origin}/react.html?lesson=structured-output"]`,
    )?.textContent,
  ).toContain('Open full workbench');
});

test('lessons without a capture replay the video and never fetch', () => {
  const { fetchMock, intersect } = setup();
  render(<WorkbenchPanel lesson="production-recovery" sdk="angular" />);
  intersect();

  fireEvent.click(liveTab());

  expect(WORKBENCH_LESSONS_WITHOUT_CAPTURE).toEqual(['production-recovery']);
  expect(replayFrame()).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(document.querySelector('video')?.getAttribute('poster')).toBe(
    '/video/docs/canonical-workbench-production-recovery-angular-poster.png',
  );
  expect(document.querySelector('iframe[src*="embed=live"]')).toBeNull();
});

test('partial captures say the replay starts after the reload', () => {
  const { intersect } = setup();
  render(<WorkbenchPanel lesson="save-text-conversations" sdk="react" />);
  intersect();

  const note = document.body.textContent;
  cleanup();
  render(<WorkbenchPanel lesson="tools" sdk="react" />);

  expect(note).toContain(
    'This replay starts after the page reload; the video shows the whole run.',
  );
  expect(document.body.textContent).not.toContain('This replay starts after');
});

test('workbenchMediaId maps generative-ui and structured-output to their media names', () => {
  const lessons = workbenchLessons.map((lesson) => lesson.id);

  const ids = lessons.flatMap((lesson) => [
    workbenchMediaId(lesson, 'react'),
    workbenchMediaId(lesson, 'angular'),
  ]);

  expect(workbenchMediaId('generative-ui', 'react')).toBe(
    'canonical-workbench-ui-react',
  );
  expect(workbenchMediaId('structured-output', 'angular')).toBe(
    'canonical-workbench-structured-angular',
  );
  expect(workbenchMediaName('tools')).toBe('tools');
  expect(ids.filter((id) => !Object.hasOwn(DOCS_DEMOS, id))).toEqual([]);
  expect(LOOPBACK_LESSONS).toEqual(['server-threads', 'public-endpoint']);
});

test('workbenchOrigin defaults to the hosted workbench', () => {
  setup();
  vi.stubEnv('NEXT_PUBLIC_WORKBENCH_ORIGIN', undefined);
  const fallback = workbenchOrigin();
  vi.stubEnv('NEXT_PUBLIC_WORKBENCH_ORIGIN', 'http://localhost:4300');

  const configured = workbenchOrigin();

  expect(fallback).toBe(origin);
  expect(configured).toBe('http://localhost:4300');
});

test('workbenchOrigin drops a trailing slash or path from the configured value', () => {
  setup();
  vi.stubEnv('NEXT_PUBLIC_WORKBENCH_ORIGIN', 'http://localhost:4300/');

  const configured = workbenchOrigin();

  expect(configured).toBe('http://localhost:4300');
});

test('workbenchOrigin falls back to the hosted workbench for an empty or invalid value', () => {
  setup();
  vi.stubEnv('NEXT_PUBLIC_WORKBENCH_ORIGIN', '');
  const empty = workbenchOrigin();
  vi.stubEnv('NEXT_PUBLIC_WORKBENCH_ORIGIN', 'not a url');

  const invalid = workbenchOrigin();

  expect(empty).toBe(origin);
  expect(invalid).toBe(origin);
});

test('assertWorkbenchLesson accepts lesson ids and throws on anything else', () => {
  const known = 'tools';
  const unknown = 'ui';

  const lesson = assertWorkbenchLesson(known);

  expect(lesson).toBe('tools');
  expect(() => assertWorkbenchLesson(unknown)).toThrow(
    'Unknown workbench lesson: ui',
  );
});

test('the replay poster loads lazily', () => {
  setup();

  render(<WorkbenchPanel lesson="tools" sdk="react" />);

  expect(document.querySelector('img')?.getAttribute('loading')).toBe('lazy');
});
