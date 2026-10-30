// @vitest-environment jsdom
import { expect, onTestFinished, test, vi } from 'vitest';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import { createWorkbenchCapture } from '../examples/quickstart/runtime/workbench-capture';
import { createWorkbenchLayoutStore } from '../examples/quickstart/runtime/workbench-layout';
import type { WorkbenchLessonId } from '../examples/quickstart/runtime/workbench-lessons';
import { mountWorkbench } from '../examples/quickstart/runtime/workbench-view';

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

function mountPanel(
  lesson: {
    id: string;
    inspector: string;
    format: 'ui';
    title: string;
  },
  format?: 'decision',
) {
  const host = document.createElement('div');
  document.body.append(host);
  const store = createWorkbenchStore(format);
  const shell = mountWorkbench(
    host,
    store,
    {
      framework: 'React',
      lesson,
      send: vi.fn(),
      stop: vi.fn(),
      reset: vi.fn(),
    },
    { layout: createWorkbenchLayoutStore(fakeStorage()) },
  );
  return { host, store, shell };
}

function streamPlan(store: ReturnType<typeof createWorkbenchStore>) {
  store.send('Create a plan');
  store.record('request', { requestId: 'r1', input: { messages: [] } });
  store.record('event', {
    type: 'TEXT_MESSAGE_CONTENT',
    messageId: 'm1',
    delta: '{"ui":[{"SummaryCard":{"props":{"title":"Trusted plan"}}}]}',
  });
  store.parsed({
    ui: [
      {
        SummaryCard: {
          props: { title: 'Trusted plan', steps: ['Outline', 'Record'] },
        },
      },
    ],
  });
  store.settle('complete', 'stop');
}

function modeLabels(host: HTMLElement) {
  return [
    ...host.querySelectorAll(
      '[role=radiogroup][aria-label="Inspector view"] [role=radio]',
    ),
  ].map((node) => node.textContent);
}

function chooseMode(host: HTMLElement, label: string) {
  const radio = [...host.querySelectorAll<HTMLElement>('[role=radio]')].find(
    (node) => node.textContent === label,
  );
  if (!radio) throw new Error(`Missing ${label}`);
  radio.click();
}

function clickTab(host: HTMLElement, name: string) {
  const tab = [...host.querySelectorAll<HTMLElement>('[role=tab]')].find(
    (node) => node.textContent === name,
  );
  if (!tab) throw new Error(`Missing tab ${name}`);
  tab.click();
}

const generative = {
  id: 'generative-ui',
  title: 'Generative UI',
  format: 'ui' as const,
  inspector: 'UI',
};

test('shows one section with a mode toggle on the UI tab', () => {
  const { host, store, shell } = mountPanel(generative);

  streamPlan(store);

  expect(host.querySelectorAll('.wb-inspector .wb-section')).toHaveLength(1);
  expect(modeLabels(host)).toEqual(['Schema', 'Raw', 'Parsed', 'Resolved']);
  expect(
    host.querySelector('[role=radio][aria-checked=true]')?.textContent,
  ).toBe('Resolved');
  expect(host.querySelector('.wb-raw')).toBeNull();
  expect(host.querySelector('.wb-selection')).toBeNull();
  expect(
    [...host.querySelectorAll('h2')].some((h) => h.textContent === 'Inspector'),
  ).toBe(false);
  shell.dispose();
});

test('Raw shows the frame json and the choice survives a tab round trip', () => {
  const { host, store, shell } = mountPanel(generative);
  streamPlan(store);
  const json = store.getSnapshot().frame?.json ?? '';

  chooseMode(host, 'Raw');
  const rawText = host.querySelector('.wb-inspection pre')?.textContent;
  clickTab(host, 'State');
  clickTab(host, 'UI');

  expect(json).not.toBe('');
  expect(rawText).toBe(json);
  expect(
    host.querySelector('[role=radio][aria-checked=true]')?.textContent,
  ).toBe('Raw');
  expect(host.querySelector('.wb-inspection pre')?.textContent).toBe(rawText);
  shell.dispose();
});

test('captions the panel with its source, turn and event position', () => {
  const { host, store, shell } = mountPanel(generative);

  streamPlan(store);

  expect(host.querySelector('.wb-inspector .wb-caption')?.textContent).toMatch(
    /· turn \d+ · event \d+\/\d+( · live)?$/,
  );
  shell.dispose();
});

test('a recipe lesson shows its two recipe modes plus Raw', () => {
  const { host, store, shell } = mountPanel({
    id: 'local-models',
    title: 'Local models',
    format: 'ui',
    inspector: 'Model',
  });

  streamPlan(store);

  const labels = modeLabels(host);
  expect(labels).toHaveLength(3);
  expect(labels[2]).toBe('Raw');
  shell.dispose();
});

test('shows the waiting text instead of null before a decision arrives', () => {
  const { host, store, shell } = mountPanel(
    {
      id: 'decisions',
      title: 'Decisions',
      format: 'decision' as 'ui',
      inspector: 'JSON',
    },
    'decision',
  );

  store.send('Decide');
  chooseMode(host, 'Typed choice');

  expect(host.querySelector('.wb-inspection pre')?.textContent).toBe(
    'Waiting for captured data',
  );
  shell.dispose();
});

test('captions a loading capture as streaming and the newest event as live', () => {
  const { host, store, shell } = mountPanel(generative);

  store.send('Create a plan');
  const loading = host.querySelector('.wb-caption')?.textContent;
  store.settle('complete', 'stop');
  const live = host.querySelector('.wb-caption')?.textContent;
  store.seek(0);
  const replay = host.querySelector('.wb-caption')?.textContent;

  expect(loading).toMatch(/· event 1\/1 · streaming · live$/);
  expect(live).toMatch(/· turn 1 · event \d+\/\d+ · live$/);
  expect(replay).toMatch(/· turn 1 · event 1\/\d+/);
  expect(replay).not.toContain('live');
  shell.dispose();
});

test('the State tab shows a tree whose closed branches survive a new event', () => {
  const { host, store, shell } = mountPanel(generative);
  streamPlan(store);
  clickTab(host, 'State');
  const tree = host.querySelector<HTMLElement>('[data-captured] [role=tree]');
  const branch = tree?.querySelector<HTMLElement>(
    '[role=treeitem][aria-expanded=true]',
  );
  const path = branch?.dataset.path;
  branch?.click();

  store.record('event', { type: 'RUN_FINISHED' });

  expect(tree).not.toBeNull();
  expect(host.querySelector('[data-captured] [role=tree]')).toBe(tree);
  expect(
    tree?.querySelector(`[data-path="${path}"]`)?.getAttribute('aria-expanded'),
  ).toBe('false');
  expect(JSON.parse(tree?.dataset.json ?? 'null')).toHaveProperty('moment');
  shell.dispose();
});

test('highlights the application field that changed from the previous event', () => {
  const { host, store, shell } = mountPanel(generative);
  streamPlan(store);
  clickTab(host, 'State');

  const accepted = store.accept({
    title: 'Trusted plan',
    steps: ['Outline', 'Record'],
  });

  const frames = store.getSnapshot().events;
  const tree = host.querySelector('[data-captured] [role=tree]');
  const changed = [...(tree?.querySelectorAll('[data-changed]') ?? [])].map(
    (node) => (node as HTMLElement).dataset.path,
  );
  expect(accepted).toBe(true);
  expect(frames.at(-1)?.application.revision).not.toBe(
    frames.at(-2)?.application.revision,
  );
  expect(changed).toContain('/revision');
  shell.dispose();
});

test('highlights nothing on the first State render of a new conversation', () => {
  const { host, store, shell } = mountPanel(generative);
  streamPlan(store);
  store.accept({ title: 'Trusted plan', steps: ['Outline', 'Record'] });

  store.clear();
  streamPlan(store);
  store.seek(0);
  clickTab(host, 'State');

  expect(host.querySelector('[data-captured] [role=tree]')).not.toBeNull();
  expect(host.querySelectorAll('[data-captured] [data-changed]')).toHaveLength(
    0,
  );
  shell.dispose();
});

function mountReplayEmbed(
  lesson: Parameters<typeof mountPanel>[0] = generative,
  format?: 'decision',
) {
  const post = vi
    .spyOn(window, 'postMessage')
    .mockImplementation(() => undefined);
  const host = document.createElement('div');
  document.body.append(host);
  const store = createWorkbenchStore(format);
  const shell = mountWorkbench(
    host,
    store,
    {
      framework: 'React',
      lesson,
      send: vi.fn(),
      stop: vi.fn(),
      reset: vi.fn(),
    },
    { layout: createWorkbenchLayoutStore(fakeStorage()), embed: 'replay' },
  );
  onTestFinished(() => {
    shell.dispose();
    host.remove();
    post.mockRestore();
  });
  return { host, store };
}

function loadRecording(
  lesson: string,
  source: ReturnType<typeof createWorkbenchStore> = (() => {
    const recorded = createWorkbenchStore();
    streamPlan(recorded);
    return recorded;
  })(),
) {
  const capture = {
    ...createWorkbenchCapture(source.getSnapshot(), {
      lesson: lesson as WorkbenchLessonId,
      framework: 'react',
      recordedAt: '2026-10-28T00:00:00.000Z',
    }),
    commit: 'c29b05b1234567890',
  };
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { type: 'hb-workbench:load', version: 1, capture },
      origin: 'https://hashbrown.dev',
      source: window,
    }),
  );
  return capture;
}

test('a loaded replay embed drops the source label, live button and read-only notes', () => {
  const { host, store } = mountReplayEmbed();

  loadRecording(generative.id);

  const text = host.textContent ?? '';
  expect(store.getSnapshot().readOnly).toBe(true);
  expect(text).not.toContain('Live model');
  expect(text).not.toContain('Awaiting source');
  expect(text).not.toContain('Replay is read-only.');
  expect(text).not.toContain('captured preview');
  expect(text).not.toContain('Recorded at');
  expect(host.querySelector<HTMLElement>('.wb-live')?.hidden).toBe(true);
  expect(host.querySelector('[role=status]')?.textContent).toMatch(
    /^[0-9a-f]{7}$/,
  );
});

test('a live workbench keeps its source label and live button', () => {
  const { host, store, shell } = mountPanel(generative);

  streamPlan(store);

  const label = host.querySelector<HTMLElement>('[data-source]');
  expect(label?.hidden).toBe(false);
  expect(label?.textContent).toBeTruthy();
  expect(host.querySelector<HTMLElement>('.wb-live')?.hidden).toBe(false);
  shell.dispose();
});

test('a decision replay drops the captured-result and read-only notes', () => {
  const decisions = {
    id: 'decisions',
    title: 'Decisions',
    format: 'decision' as 'ui',
    inspector: 'JSON',
  };
  const { host, store } = mountReplayEmbed(decisions, 'decision');
  const recorded = createWorkbenchStore('decision');
  recorded.send('Decide');
  const requestId = recorded
    .getSnapshot()
    .frame?.messages.filter((message) => message.role === 'user')
    .at(-1)?.id;
  recorded.recordDecision(
    { nextAction: 'review', confidence: 0.9 },
    requestId ?? '',
  );
  recorded.settle('complete', 'stop');

  loadRecording(decisions.id, recorded);
  store.live();

  const text = host.textContent ?? '';
  expect(store.getSnapshot().readOnly).toBe(true);
  expect(text).toContain('Next action: review');
  expect(text).not.toContain('Closed choice');
  expect(text).not.toContain('captured result');
  expect(text).not.toContain('Replay is read-only.');
});
