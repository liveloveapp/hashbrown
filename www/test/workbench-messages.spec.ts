// @vitest-environment jsdom
import { expect, onTestFinished, test, vi } from 'vitest';
import {
  createWorkbenchStore,
  type WorkbenchStore,
} from '../examples/quickstart/runtime/workbench';
import { createWorkbenchCapture } from '../examples/quickstart/runtime/workbench-capture';
import { createWorkbenchLayoutStore } from '../examples/quickstart/runtime/workbench-layout';
import { isAllowedParentOrigin } from '../examples/quickstart/runtime/workbench-messages';
import { mountWorkbench } from '../examples/quickstart/runtime/workbench-view';

const docsOrigin = 'https://hashbrown.dev';

function recordedCapture() {
  const store = createWorkbenchStore();
  store.send('Plan a demo');
  store.record('request', { requestId: 'r1' });
  store.parsed({
    ui: [{ SummaryCard: { props: { title: 'Demo', steps: ['Outline'] } } }],
  });
  store.settle('complete', 'stop');
  return {
    ...createWorkbenchCapture(store.getSnapshot(), {
      lesson: 'tools',
      framework: 'react',
      recordedAt: '2026-10-28T00:00:00.000Z',
    }),
    commit: '0123456789abcdef',
  };
}

function mountReplay(store: WorkbenchStore = createWorkbenchStore()) {
  const post = vi
    .spyOn(window, 'postMessage')
    .mockImplementation(() => undefined);
  const host = document.createElement('div');
  document.body.append(host);
  const mounted = mountWorkbench(
    host,
    store,
    {
      framework: 'React',
      lesson: {
        id: 'tools',
        title: 'Tools',
        format: 'ui',
        inspector: 'Requests',
      },
      send: vi.fn(),
      stop: vi.fn(),
      reset: vi.fn(),
    },
    { layout: createWorkbenchLayoutStore(), embed: 'replay' },
  );
  onTestFinished(() => {
    mounted.dispose();
    host.remove();
    post.mockRestore();
  });
  return { host, store, post };
}

function fromParent(data: unknown, origin = docsOrigin) {
  window.dispatchEvent(
    new MessageEvent('message', { data, origin, source: window }),
  );
}

test('posts ready on mount and ignores messages from foreign origins', () => {
  const { host, post } = mountReplay();

  fromParent(
    { type: 'hb-workbench:load', version: 1, capture: recordedCapture() },
    'https://evil.com',
  );

  expect(post.mock.calls).toEqual([
    [
      {
        type: 'hb-workbench:ready',
        version: 1,
        mode: 'replay',
        lesson: 'tools',
        framework: 'react',
      },
      '*',
    ],
  ]);
  expect(host.textContent).toContain('Waiting for recording');
});

test('loads a matching capture and reports its milestone ids', () => {
  const { host, store, post } = mountReplay();
  post.mockClear();

  fromParent({
    type: 'hb-workbench:load',
    version: 1,
    capture: recordedCapture(),
  });

  expect(store.getSnapshot().readOnly).toBe(true);
  expect(host.textContent).toContain('Recorded at 0123456');
  expect(host.querySelector<HTMLElement>('.wb-composer')?.hidden).toBe(true);
  expect(post).toHaveBeenCalledWith(
    {
      type: 'hb-workbench:loaded',
      version: 1,
      milestones: [
        { id: 'prompt-1', label: 'Prompt' },
        { id: 'request-1', label: 'Request' },
        { id: 'parsed-output-1', label: 'Parsed output' },
        { id: 'complete-1', label: 'Complete' },
      ],
      commit: '0123456789abcdef',
    },
    docsOrigin,
  );
  expect(post.mock.calls.every(([, origin]) => origin === docsOrigin)).toBe(
    true,
  );
});

test('rejects a capture for another lesson or version', () => {
  const { host, store, post } = mountReplay();
  post.mockClear();

  fromParent({
    type: 'hb-workbench:load',
    version: 1,
    capture: { ...recordedCapture(), lesson: 'generative-ui' },
  });
  fromParent({
    type: 'hb-workbench:load',
    version: 1,
    capture: { ...recordedCapture(), version: 2 },
  });
  fromParent({ type: 'hb-workbench:load', version: 1, capture: { bad: 1 } });

  expect(post.mock.calls).toEqual([
    [
      { type: 'hb-workbench:rejected', version: 1, reason: 'lesson' },
      docsOrigin,
    ],
    [
      { type: 'hb-workbench:rejected', version: 1, reason: 'version' },
      docsOrigin,
    ],
    [
      { type: 'hb-workbench:rejected', version: 1, reason: 'malformed' },
      docsOrigin,
    ],
  ]);
  expect(store.getSnapshot().readOnly).toBe(false);
  expect(host.textContent).toContain('Waiting for recording');
});

test('seek moves the replay to the named milestone and reports state', () => {
  const { store, post } = mountReplay();
  fromParent({
    type: 'hb-workbench:load',
    version: 1,
    capture: recordedCapture(),
  });
  post.mockClear();

  fromParent({
    type: 'hb-workbench:seek',
    version: 1,
    milestone: 'complete-1',
  });
  const cursor = store.getSnapshot().cursor;
  fromParent({ type: 'hb-workbench:seek', version: 1, milestone: 'missing-9' });

  expect(cursor).toBe(store.getSnapshot().events.length - 1);
  expect(store.getSnapshot().cursor).toBe(cursor);
  expect(post.mock.calls).toEqual([
    [
      {
        type: 'hb-workbench:state',
        version: 1,
        mode: 'replay',
        milestone: 'complete-1',
        playing: false,
      },
      docsOrigin,
    ],
  ]);
});

test('isAllowedParentOrigin accepts docs, previews and localhost only', () => {
  const accepted = [
    'https://hashbrown.dev',
    'https://www.hashbrown.dev',
    'https://hashbrown-www-abc-blovedev.vercel.app',
    'http://localhost:3000',
  ];
  const rejected = [
    'https://evil.com',
    'https://a.b.vercel.app',
    'http://hashbrown.dev',
    'https://vercel.app',
    'https://hashbrown.dev.evil.com',
    'http://localhost',
    'https://localhost:3000',
    'http://127.0.0.1:3000',
    'null',
  ];

  const results = [...accepted, ...rejected].map(isAllowedParentOrigin);

  expect(results).toEqual([
    ...accepted.map(() => true),
    ...rejected.map(() => false),
  ]);
});

test('play reports each step and the stop at the end of the recording', () => {
  vi.useFakeTimers();
  onTestFinished(() => void vi.useRealTimers());
  const { post } = mountReplay();
  fromParent({
    type: 'hb-workbench:load',
    version: 1,
    capture: recordedCapture(),
  });
  post.mockClear();

  fromParent({ type: 'hb-workbench:play', version: 1 });
  vi.runAllTimers();

  const states = post.mock.calls.map(([message]) => message);
  expect(states.at(0)).toMatchObject({ milestone: 'prompt-1', playing: true });
  expect(states.at(-1)).toEqual({
    type: 'hb-workbench:state',
    version: 1,
    mode: 'replay',
    milestone: 'complete-1',
    playing: false,
  });
});
