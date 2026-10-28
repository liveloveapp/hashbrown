// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import { createWorkbenchLayoutStore } from '../examples/quickstart/runtime/workbench-layout';
import { mountWorkbench } from '../examples/quickstart/runtime/workbench-view';

type Store = ReturnType<typeof createWorkbenchStore>;

const url = 'http://localhost:4300/api/workbench/tools';

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

function mountRequests() {
  const host = document.createElement('div');
  document.body.append(host);
  const store = createWorkbenchStore();
  const shell = mountWorkbench(
    host,
    store,
    {
      framework: 'React',
      lesson: {
        id: 'tools',
        title: 'Tools',
        format: 'ui',
        inspector: 'Requests',
        endpoint: '/api/workbench/tools',
      },
      send: vi.fn(),
      stop: vi.fn(),
      reset: vi.fn(),
    },
    { layout: createWorkbenchLayoutStore(fakeStorage()) },
  );
  return { host, store, shell };
}

function requestPayload(requestId: string) {
  return {
    url,
    requestId,
    attempt: 1,
    input: {
      threadId: 'thread-1',
      runId: `run-${requestId}`,
      messages: [
        { id: 'system', role: 'system', content: 'Be brief.' },
        { id: 'user', role: 'user', content: 'Plan' },
      ],
      tools: [
        {
          name: 'readContext',
          description: 'Reads the application plan',
          parameters: { type: 'object', properties: {} },
        },
      ],
      state: { revision: 0 },
      context: [],
    },
  };
}

/** One turn: a model request, a browser tool call and its continuation. */
function recordToolTurn(store: Store) {
  store.send('Plan');
  store.record('request', requestPayload('r1'));
  store.record('response', { status: 200, url, source: 'provider' });
  store.record('event', { type: 'RUN_STARTED' });
  store.record('event', {
    type: 'TOOL_CALL_START',
    toolCallId: 'call-1',
    toolCallName: 'readContext',
  });
  store.record('event', { type: 'TOOL_CALL_END', toolCallId: 'call-1' });
  store.record('event', { type: 'RUN_FINISHED' });
  store.record('tool', { name: 'readContext', result: { revision: 0 } });
  store.record('request', requestPayload('r2'));
  store.record('response', { status: 200, url, source: 'provider' });
  store.record('event', {
    type: 'TEXT_MESSAGE_CONTENT',
    messageId: 'm1',
    delta: '{"title":"Plan"}',
  });
  store.record('event', { type: 'RUN_FINISHED' });
  store.settle('complete', 'stop');
}

function recordDeniedTurn(store: Store, content = 'Denied') {
  store.send(content);
  store.record('request', requestPayload(`denied-${content}`));
  store.record('response', {
    status: 403,
    url,
    source: 'demo-failure',
    problem: 'Demo denial is enabled',
  });
  store.settle('error');
}

function rowButton(host: HTMLElement, name: string, nth = 0) {
  const found = [
    ...host.querySelectorAll<HTMLButtonElement>(
      '.wb-requests-table button[data-exchange]',
    ),
  ].filter((node) => node.textContent === name)[nth];
  if (!found) throw new Error(`Missing ${name} row`);
  return found;
}

function detailTabs(host: HTMLElement) {
  return [
    ...host.querySelectorAll<HTMLButtonElement>('[data-detail] [role=tab]'),
  ];
}

function detailTab(host: HTMLElement, name: string) {
  const found = detailTabs(host).find((tab) =>
    tab.textContent?.startsWith(name),
  );
  if (!found) throw new Error(`Missing ${name} tab`);
  return found;
}

function press(target: EventTarget, key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

function pointer(target: EventTarget, type: string, clientX: number) {
  target.dispatchEvent(
    Object.assign(
      new MouseEvent(type, {
        clientX,
        bubbles: true,
        cancelable: true,
        // A press and the moves of a drag hold the primary button.
        buttons: type === 'pointerdown' || type === 'pointermove' ? 1 : 0,
      }),
      { pointerId: 1 },
    ),
  );
}

test('renders the overview, a turn-grouped table and no selection', () => {
  const { host, store, shell } = mountRequests();

  recordToolTurn(store);

  const headers = [...host.querySelectorAll('.wb-requests-table thead th')].map(
    (cell) => cell.textContent,
  );
  const group = host.querySelector('.wb-requests-table tbody th');
  expect(headers).toEqual([
    'Name',
    'Type',
    'Status',
    'Start',
    'Duration',
    'Events',
    'Waterfall',
  ]);
  expect(
    host.querySelector('[role=slider][aria-label="Seek request timeline"]'),
  ).not.toBeNull();
  expect(host.querySelector('[data-detail]')).toBeNull();
  expect(
    host.querySelector('.wb-inspector .wb-inspection')?.textContent,
  ).toContain('Model request');
  expect(group?.textContent).toBe('Turn 1 · Plan');
  expect(host.querySelector('.wb-requests-table')?.textContent).toContain(
    'POST /api/workbench/tools',
  );
  shell.dispose();
});

test('selecting a row seeks, narrows the table and opens request tabs', () => {
  const { host, store, shell } = mountRequests();
  recordToolTurn(store);
  const events = store.getSnapshot().events;
  const firstRequest = events.findIndex((event) => event.kind === 'request');

  rowButton(host, 'Model request').click();

  const row = host.querySelector('.wb-requests-table tr[aria-selected=true]');
  expect(store.getSnapshot().cursor).toBe(firstRequest);
  expect(
    host.querySelector('.wb-requests-table')?.hasAttribute('data-narrow'),
  ).toBe(true);
  expect(detailTabs(host).map((tab) => tab.textContent)).toEqual([
    'Overview',
    'Messages 2',
    'Tools 1',
    'State',
    'Raw request',
    'Response 5',
  ]);
  expect(host.querySelector('[data-detail]')).not.toBeNull();
  expect(row?.querySelector('button')?.getAttribute('aria-pressed')).toBe(
    'true',
  );
  expect(host.querySelector('[data-detail]')?.textContent).toContain(
    'Sent: 2 messages · 1 tool · state revision 0',
  );
  shell.dispose();
});

test('shows tool and error tabs', () => {
  const { host, store, shell } = mountRequests();
  recordToolTurn(store);

  rowButton(host, 'readContext').click();
  const toolTabs = detailTabs(host).map((tab) => tab.textContent);
  const call = host.querySelector('[data-detail]')?.textContent;
  store.live();
  recordDeniedTurn(store);
  rowButton(host, 'Model request', 1).click();
  const errorTabs = detailTabs(host).map((tab) => tab.textContent);

  expect(toolTabs).toEqual(['Call', 'Result', 'Raw']);
  expect(call).toContain('Runs in');
  expect(call).toContain('Browser');
  expect(errorTabs).toEqual(['Overview', 'Raw']);
  expect(host.querySelector('[data-detail]')?.textContent).toContain(
    'Demo denial is enabled',
  );
  shell.dispose();
});

test("auto-selects a live HTTP error but never replaces a user's selection", () => {
  const { host, store, shell } = mountRequests();
  recordToolTurn(store);
  const selectedName = () =>
    host.querySelector(
      '.wb-requests-table tr[aria-selected=true] button[data-exchange]',
    );

  recordDeniedTurn(store, 'Second');
  const auto = selectedName();
  const autoTurn = auto?.closest('tbody')?.getAttribute('data-turn');
  rowButton(host, 'readContext').click();
  store.live();
  recordDeniedTurn(store, 'Third');

  expect(auto?.textContent).toBe('Model request');
  expect(autoTurn).toBe('2');
  expect(selectedName()?.textContent).toBe('readContext');
  expect(host.querySelector('[data-detail]')?.textContent).not.toContain(
    'Demo denial is enabled',
  );
  shell.dispose();
});

test('closes the detail with the close button and Escape', () => {
  const { host, store, shell } = mountRequests();
  recordToolTurn(store);

  const first = rowButton(host, 'Model request');
  first.focus();
  first.click();
  host
    .querySelector<HTMLButtonElement>('[aria-label="Close request detail"]')
    ?.click();
  const afterClose = document.activeElement;
  const closedDetail = host.querySelector('[data-detail]');
  rowButton(host, 'readContext').click();
  const escape = press(detailTab(host, 'Result'), 'Escape');

  expect(closedDetail).toBeNull();
  expect(afterClose?.textContent).toBe('Model request');
  expect(afterClose?.hasAttribute('data-exchange')).toBe(true);
  expect(host.querySelector('[data-detail]')).toBeNull();
  expect(
    host.querySelector('.wb-requests-table')?.hasAttribute('data-narrow'),
  ).toBe(false);
  expect(escape.defaultPrevented).toBe(true);
  expect(document.activeElement?.textContent).toBe('readContext');
  expect(host.querySelector('[aria-label="Back to requests"]')).toBeNull();
  shell.dispose();
});

test('keeps the selection and focus across store updates', () => {
  const { host, store, shell } = mountRequests();
  store.send('Plan');
  store.record('request', requestPayload('r1'));
  store.record('response', { status: 200, url, source: 'provider' });
  const button = rowButton(host, 'Model request');
  button.focus();
  button.click();
  detailTab(host, 'Response').click();
  button.focus();

  store.record('event', { type: 'RUN_STARTED' });
  store.record('event', {
    type: 'TEXT_MESSAGE_CONTENT',
    messageId: 'm1',
    delta: 'Hi',
  });

  expect(document.activeElement).toBe(button);
  expect(button.getAttribute('aria-pressed')).toBe('true');
  expect(
    host.querySelector('[data-detail] [role=tab][aria-selected=true]')
      ?.textContent,
  ).toBe('Response 3');
  expect(
    host.querySelectorAll('[data-detail] [data-event-index]'),
  ).toHaveLength(3);
  shell.dispose();
});

test('greys rows after the playhead and marks the current row', () => {
  const { host, store, shell } = mountRequests();
  recordToolTurn(store);
  const live = host.querySelectorAll('.wb-requests-table tr[data-future]');
  const firstRequest = store
    .getSnapshot()
    .events.findIndex((event) => event.kind === 'request');

  store.seek(firstRequest);

  const rows = [
    ...host.querySelectorAll<HTMLElement>(
      '.wb-requests-table tr[data-exchange]',
    ),
  ];
  expect(live).toHaveLength(0);
  expect(rows.map((row) => row.hasAttribute('data-current'))).toEqual([
    true,
    false,
    false,
  ]);
  expect(rows.map((row) => row.hasAttribute('data-future'))).toEqual([
    false,
    true,
    true,
  ]);
  shell.dispose();
});

test('Response lists events and seeks on click', () => {
  const { host, store, shell } = mountRequests();
  recordToolTurn(store);
  rowButton(host, 'Model request').click();
  detailTab(host, 'Response').click();
  const rows = [
    ...host.querySelectorAll<HTMLButtonElement>(
      '[data-detail] button[data-event-index]',
    ),
  ];
  const target = rows[2];
  const index = Number(target.dataset.eventIndex);

  target.click();

  const raw = host.querySelector('[data-detail] .wb-requests-event-raw');
  const items = [...host.querySelectorAll('[data-detail] li[data-event]')];
  expect(
    rows.map((row) => row.querySelector('.wb-badge')?.textContent),
  ).toEqual([
    'response',
    'RUN_STARTED',
    'TOOL_CALL_START',
    'TOOL_CALL_END',
    'RUN_FINISHED',
  ]);
  expect(store.getSnapshot().cursor).toBe(index);
  expect(raw?.textContent).toContain('"toolCallName": "readContext"');
  expect(host.querySelector('[data-detail]')?.textContent).toContain(
    'readContext',
  );
  expect(items.map((item) => item.hasAttribute('data-future'))).toEqual([
    false,
    false,
    false,
    true,
    true,
  ]);
  shell.dispose();
});

test('Raw request highlights the captured payload and copies it', async () => {
  const { host, store, shell } = mountRequests();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
  recordToolTurn(store);
  rowButton(host, 'Model request').click();
  detailTab(host, 'Raw request').click();

  host
    .querySelector<HTMLButtonElement>('[aria-label="Copy raw request"]')
    ?.click();

  const block = host.querySelector('[data-detail] pre');
  expect(block?.querySelector('.wb-tok-key')).not.toBeNull();
  expect(block?.textContent).toBe(
    JSON.stringify(requestPayload('r1'), null, 2),
  );
  expect(writeText).toHaveBeenCalledWith(
    JSON.stringify(requestPayload('r1'), null, 2),
  );
  Reflect.deleteProperty(navigator, 'clipboard');
  shell.dispose();
});

test('roves between row buttons with the arrow keys', () => {
  const { host, store, shell } = mountRequests();
  recordToolTurn(store);
  const first = rowButton(host, 'Model request');
  first.focus();

  const down = press(first, 'ArrowDown');
  const afterDown = document.activeElement;
  press(afterDown as HTMLElement, 'End');
  const afterEnd = document.activeElement;
  press(afterEnd as HTMLElement, 'ArrowUp');

  expect(down.defaultPrevented).toBe(true);
  expect(afterDown?.textContent).toBe('readContext');
  expect(afterDown?.getAttribute('tabindex')).toBe('0');
  expect(first.getAttribute('tabindex')).toBe('-1');
  expect(afterEnd?.textContent).toBe('Continuation');
  expect(document.activeElement?.textContent).toBe('readContext');
  expect(store.getSnapshot().cursor).toBeNull();
  shell.dispose();
});

test('scrubs from the overview strip', () => {
  let now = 0;
  const clock = vi
    .spyOn(performance, 'now')
    .mockImplementation(() => (now += 10));
  const { host, store, shell } = mountRequests();
  recordToolTurn(store);
  const total = store.getSnapshot().events.length;
  const slider = host.querySelector<HTMLElement>(
    '[role=slider][aria-label="Seek request timeline"]',
  ) as HTMLElement;
  vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    right: 1000,
    width: 1000,
  } as DOMRect);
  const before = slider.getAttribute('aria-valuenow');

  pointer(slider, 'pointerdown', 0);
  const atStart = store.getSnapshot().cursor;
  pointer(slider, 'pointermove', 1000);
  pointer(slider, 'pointerup', 1000);
  const atEnd = store.getSnapshot().cursor;
  press(slider, 'Home');
  const home = store.getSnapshot().cursor;
  const right = press(slider, 'ArrowRight');
  const stepped = store.getSnapshot().cursor;
  press(slider, 'End');

  expect(before).toBe(String(total - 1));
  expect(slider.getAttribute('aria-valuemax')).toBe(String(total - 1));
  expect(slider.tabIndex).toBe(0);
  expect(atStart).toBe(0);
  expect(atEnd).toBe(total - 1);
  expect(home).toBe(0);
  expect(right.defaultPrevented).toBe(true);
  expect(stepped).toBe(1);
  expect(store.getSnapshot().cursor).toBe(total - 1);
  expect(slider.getAttribute('aria-valuenow')).toBe(String(total - 1));
  expect(slider.getAttribute('aria-valuetext')).toContain(`${total}`);
  expect(document.activeElement).toBe(slider);
  clock.mockRestore();
  shell.dispose();
});

test('auto-selects a repeat HTTP error after the conversation is cleared', () => {
  const { host, store, shell } = mountRequests();
  recordDeniedTurn(store);
  const first = host.querySelector('[data-detail]')?.textContent;

  store.clear();
  const cleared = host.querySelector('[data-detail]');
  recordDeniedTurn(store);

  expect(first).toContain('Demo denial is enabled');
  expect(cleared).toBeNull();
  expect(host.querySelector('[data-detail]')?.textContent).toContain(
    'Demo denial is enabled',
  );
  expect(
    host.querySelector('.wb-requests-table tr[aria-selected=true] button')
      ?.textContent,
  ).toBe('Model request');
  shell.dispose();
});

test('drops a user selection when the conversation is cleared', () => {
  const { host, store, shell } = mountRequests();
  recordToolTurn(store);
  rowButton(host, 'readContext').click();
  store.live();
  const inspectorTab = (name: string) =>
    [...host.querySelectorAll<HTMLButtonElement>('.wb-tabs [role=tab]')]
      .find((tab) => tab.textContent === name)
      ?.click();

  inspectorTab('State');
  store.clear();
  recordToolTurn(store);
  inspectorTab('Requests');

  expect(host.querySelector('[data-detail]')).toBeNull();
  expect(
    host.querySelectorAll('.wb-requests-table tr[aria-selected=true]'),
  ).toHaveLength(0);
  shell.dispose();
});

test('keeps focus on a detail tab and a response event across streamed events', () => {
  const { host, store, shell } = mountRequests();
  store.send('Plan');
  store.record('request', requestPayload('r1'));
  store.record('response', { status: 200, url, source: 'provider' });
  rowButton(host, 'Model request').click();
  detailTab(host, 'Response').focus();
  detailTab(host, 'Response').click();

  store.record('event', { type: 'RUN_STARTED' });
  const tabFocus = (document.activeElement as HTMLElement | null)?.dataset
    .focusKey;
  host
    .querySelector<HTMLButtonElement>('[data-detail] button[data-event-index]')
    ?.focus();
  store.record('event', {
    type: 'TEXT_MESSAGE_CONTENT',
    messageId: 'm1',
    delta: 'Hi',
  });
  const eventFocus = document.activeElement as HTMLElement | null;

  expect(tabFocus).toBe('tab:Response');
  expect(eventFocus?.dataset.focusKey).toMatch(/^event:\d+$/);
  expect(eventFocus?.isConnected).toBe(true);
  expect(
    host.querySelectorAll('[data-detail] [data-event-index]'),
  ).toHaveLength(3);
  shell.dispose();
});

test('selects a row while busy without seeking, since loading ignores seeks', () => {
  const { host, store, shell } = mountRequests();
  store.send('Plan');
  store.record('request', requestPayload('r1'));

  rowButton(host, 'Model request').click();

  expect(store.getSnapshot().status).toBe('loading');
  expect(store.getSnapshot().cursor).toBeNull();
  expect(host.querySelector('[data-detail]')).not.toBeNull();
  expect(
    host.querySelector('.wb-requests-table tr[aria-selected=true]'),
  ).not.toBeNull();
  shell.dispose();
});

test('stays live when ArrowRight or End is pressed at the live end', () => {
  const { host, store, shell } = mountRequests();
  recordToolTurn(store);
  const slider = host.querySelector<HTMLElement>(
    '[role=slider][aria-label="Seek request timeline"]',
  ) as HTMLElement;

  press(slider, 'ArrowRight');
  const afterRight = store.getSnapshot().cursor;
  press(slider, 'End');

  expect(afterRight).toBeNull();
  expect(store.getSnapshot().cursor).toBeNull();
  shell.dispose();
});

test('labels each turn band with its start time on the axis', () => {
  let now = 0;
  const clock = vi
    .spyOn(performance, 'now')
    .mockImplementation(() => (now += 100));
  const { host, store, shell } = mountRequests();

  recordToolTurn(store);
  recordDeniedTurn(store, 'Again');

  const labels = [...host.querySelectorAll('.wb-requests-band > span')].map(
    (label) => label.textContent,
  );
  const starts = [1, 2].map(
    (turn) =>
      store.getSnapshot().events.find((event) => event.turn === turn)
        ?.elapsedMs ?? 0,
  );
  expect(labels).toEqual(
    starts.map(
      (ms, index) => `Turn ${index + 1} · ${(ms / 1000).toFixed(1)} s`,
    ),
  );
  expect(starts[1]).toBeGreaterThan(starts[0]);
  clock.mockRestore();
  shell.dispose();
});

test('keeps the tab buttons and a static panel in place while the selected request streams', () => {
  const { host, store, shell } = mountRequests();
  store.send('Plan');
  store.record('request', requestPayload('r1'));
  store.record('response', { status: 200, url, source: 'provider' });
  rowButton(host, 'Model request').click();
  detailTab(host, 'Raw request').click();
  const tabsBefore = detailTabs(host);
  const rawBefore = host.querySelector('[data-detail] pre');
  const copyBefore = host.querySelector('[aria-label="Copy raw request"]');

  store.record('event', { type: 'RUN_STARTED' });
  store.record('event', {
    type: 'TEXT_MESSAGE_CONTENT',
    messageId: 'm1',
    delta: 'Hi',
  });

  expect(detailTabs(host)).toEqual(tabsBefore);
  expect(host.querySelector('[data-detail] pre')).toBe(rawBefore);
  expect(host.querySelector('[aria-label="Copy raw request"]')).toBe(
    copyBefore,
  );
  expect(detailTab(host, 'Response').textContent).toBe('Response 3');
  expect(detailTab(host, 'Raw request').getAttribute('aria-selected')).toBe(
    'true',
  );
  shell.dispose();
});

test('omits the turn-0 band that history frames would draw', () => {
  const { host, store, shell } = mountRequests();
  store.record('history', { messages: [] });

  recordToolTurn(store);

  const labels = [...host.querySelectorAll('.wb-requests-band > span')].map(
    (label) => label.textContent,
  );
  expect(store.getSnapshot().events[0].turn).toBe(0);
  expect(labels).toHaveLength(1);
  expect(labels[0]).toMatch(/^Turn 1 · /);
  shell.dispose();
});

test('keeps one failure alert in place across renders and clears it', () => {
  const { host, store, shell } = mountRequests();
  recordDeniedTurn(store);
  const alert = host.querySelector('.wb-requests > [role=alert]');

  store.live();
  store.live();
  const after = host.querySelector('.wb-requests > [role=alert]');
  const count = host.querySelectorAll('[role=alert]').length;
  store.seek(0);
  const cleared = host.querySelector('.wb-requests > [role=alert]');

  expect(alert).not.toBeNull();
  expect(after).toBe(alert);
  expect(count).toBe(1);
  expect(cleared).toBeNull();
  shell.dispose();
});

test('automatically roves request detail tabs across rebuilt tab buttons without seeking', () => {
  const { host, store, shell } = mountRequests();
  recordToolTurn(store);
  rowButton(host, 'Model request').click();
  const snapshot = store.getSnapshot();
  detailTab(host, 'Overview').focus();

  expect(detailTabs(host).filter((tab) => tab.tabIndex === 0)).toEqual([
    detailTab(host, 'Overview'),
  ]);
  expect(
    press(document.activeElement as HTMLElement, 'End').defaultPrevented,
  ).toBe(true);
  expect(document.activeElement).toBe(detailTab(host, 'Response'));
  expect(detailTab(host, 'Response').getAttribute('aria-selected')).toBe(
    'true',
  );
  press(document.activeElement as HTMLElement, 'ArrowRight');
  expect(document.activeElement).toBe(detailTab(host, 'Overview'));
  press(document.activeElement as HTMLElement, 'ArrowLeft');
  expect(document.activeElement).toBe(detailTab(host, 'Response'));
  press(document.activeElement as HTMLElement, 'Home');
  expect(document.activeElement).toBe(detailTab(host, 'Overview'));
  expect(
    press(document.activeElement as HTMLElement, 'ArrowUp').defaultPrevented,
  ).toBe(false);
  expect(
    press(document.activeElement as HTMLElement, 'End', { shiftKey: true })
      .defaultPrevented,
  ).toBe(false);
  const panel = host.querySelector<HTMLElement>(
    '.wb-requests-panel',
  ) as HTMLElement;
  expect(panel.tabIndex).toBe(0);
  expect(panel.getAttribute('aria-labelledby')).toBe(
    detailTab(host, 'Overview').id,
  );
  expect(detailTab(host, 'Overview').getAttribute('aria-controls')).toBe(
    panel.id,
  );
  expect(detailTabs(host).filter((tab) => tab.tabIndex === 0)).toEqual([
    detailTab(host, 'Overview'),
  ]);
  expect(store.getSnapshot()).toBe(snapshot);
  shell.dispose();
});
