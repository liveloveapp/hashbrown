// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import { createWorkbenchLayoutStore } from '../examples/quickstart/runtime/workbench-layout';
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
