// @vitest-environment jsdom
import { expect, onTestFinished, test, vi } from 'vitest';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import { createWorkbenchLayoutStore } from '../examples/quickstart/runtime/workbench-layout';
import { getWorkbenchLesson } from '../examples/quickstart/runtime/workbench-lessons';
import { mountWorkbench } from '../examples/quickstart/runtime/workbench-view';

function ui(title: string, steps: readonly string[]) {
  return { ui: [{ SummaryCard: { props: { title, steps } } }] };
}

function streamedTurn() {
  const store = createWorkbenchStore();
  const chunks = [
    '{"ui":[{"SummaryCard":{"props":{"title":"De',
    'mo","steps":["Out',
    'line"]}}}]}',
  ];
  store.send('Plan a demo');
  store.record('request', { requestId: 'r1' });
  store.record('event', { type: 'TEXT_MESSAGE_START', messageId: 'm1' });
  store.record('event', {
    type: 'TEXT_MESSAGE_CONTENT',
    messageId: 'm1',
    delta: chunks[0],
  });
  store.parsed(ui('Demo', []));
  store.record('event', {
    type: 'TEXT_MESSAGE_CONTENT',
    messageId: 'm1',
    delta: chunks[1],
  });
  store.record('event', {
    type: 'TEXT_MESSAGE_CONTENT',
    messageId: 'm1',
    delta: chunks[2],
  });
  store.parsed(ui('Demo', ['Outline']));
  store.settle('complete', 'stop');
  return store;
}

function mount() {
  const store = streamedTurn();
  const host = document.createElement('div');
  document.body.append(host);
  const mounted = mountWorkbench(
    host,
    store,
    {
      framework: 'React',
      lesson: getWorkbenchLesson('?lesson=generative-ui'),
      send: vi.fn(),
      stop: vi.fn(),
      reset: vi.fn(),
    },
    { layout: createWorkbenchLayoutStore() },
  );
  onTestFinished(() => {
    mounted.dispose();
    host.remove();
  });
  return { host, store };
}

function replayFeed(host: HTMLElement): HTMLElement {
  const feed = [...host.querySelectorAll<HTMLElement>('.wb-feed')].find(
    (node) => !node.hidden,
  );
  if (!feed) throw new Error('No visible chat feed');
  return feed;
}

test('the replay card shows resolved props, never a half-typed value', () => {
  const { host, store } = mount();
  const partial = store
    .getSnapshot()
    .events.findIndex((event) => event.json.endsWith('"Out'));

  store.seek(partial);

  const card = replayFeed(host).querySelector('.wb-summary');
  expect(card?.querySelector('h2')?.textContent).toBe('Demo');
  expect(card?.querySelectorAll('ol > li')).toHaveLength(0);
});

test('the chat marks the step when it resolves', () => {
  const { host, store } = mount();
  const resolved = store
    .getSnapshot()
    .events.findIndex((event) => event.props?.steps?.length === 1);

  store.seek(resolved);

  const marked = replayFeed(host).querySelector('[data-wb-fresh]');
  expect(marked?.textContent).toBe('Outline');
  expect(marked?.getAttribute('data-wb-fresh')).toBe('');
});

test('a re-render on the settle frame keeps the fading nodes', () => {
  const { host, store } = mount();
  const last = store.getSnapshot().events.length - 1;
  store.seek(last);
  const card = replayFeed(host).querySelector('[data-wb-fresh="settle"]');
  const mark = host.querySelector('.wb-inspection mark.wb-fresh-settle');

  store.seek(last);

  expect(card).not.toBeNull();
  expect(card?.textContent).toBe('Outline');
  expect(replayFeed(host).querySelector('[data-wb-fresh="settle"]')).toBe(card);
  expect(mark).not.toBeNull();
  expect(host.querySelector('.wb-inspection mark.wb-fresh-settle')).toBe(mark);
});
