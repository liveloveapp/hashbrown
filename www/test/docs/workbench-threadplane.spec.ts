// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import {
  createThreadplaneCapture,
  mountThreadplaneWorkbench,
  threadplaneInspection,
} from '../../examples/quickstart/runtime/workbench-threadplane';

const identity = { threadId: 'thread-1', runId: 'run-1' };
const envelope = {
  ...identity,
  tools: [],
  context: [],
  state: {},
  forwardedProps: {},
  messages: [{ id: 'u1', role: 'user', content: 'A two-step plan' }],
};
const events = [
  { type: 'RUN_STARTED', ...identity },
  { type: 'TEXT_MESSAGE_START', messageId: 'a1', role: 'assistant' },
  { type: 'TEXT_MESSAGE_CONTENT', messageId: 'a1', delta: 'First. Second.' },
  { type: 'TEXT_MESSAGE_END', messageId: 'a1' },
  { type: 'RUN_FINISHED', ...identity },
];
const sse = (items = events) =>
  items.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
const request = () =>
  new Request('https://example.test/api/chat', {
    method: 'POST',
    body: JSON.stringify(envelope),
  });

test('captures actual envelopes and unchanged bytes, settles only after EOF and leaves state unchanged', async () => {
  const source = sse();
  const upstream = vi.fn(
    async () =>
      new Response(source, {
        headers: { 'content-type': 'text/event-stream' },
      }),
  );
  const capture = createThreadplaneCapture({
    framework: 'React',
    origin: 'https://example.test',
    fetch: upstream,
  });
  const initial = capture.store.getSnapshot().application;

  const response = await capture.fetch(request());
  expect(capture.store.getSnapshot().status).toBe('loading');
  const bytes = await response.text();
  const snapshot = capture.store.getSnapshot();

  expect(bytes).toBe(source);
  expect(snapshot.status).toBe('complete');
  expect(snapshot.frame?.json).toBe('First. Second.');
  expect(snapshot.frame?.messages.at(-1)?.content).toBe('First. Second.');
  expect(
    snapshot.events.find((event) => event.kind === 'request')?.payload,
  ).toMatchObject({ input: envelope });
  expect(snapshot.application).toEqual(initial);
  expect(snapshot.frame?.props).toBeNull();
});

test('ignores unrelated requests and refuses chat in replay without calling upstream', async () => {
  const upstream = vi.fn(async () => new Response(sse()));
  const capture = createThreadplaneCapture({
    framework: 'Angular',
    origin: 'https://example.test',
    fetch: upstream,
  });

  await capture.fetch('https://example.test/api/chat');
  await capture.fetch('https://elsewhere.test/api/chat', {
    method: 'POST',
    body: '{}',
  });
  expect(capture.store.getSnapshot().events).toHaveLength(0);
  await (await capture.fetch(request())).text();
  capture.store.seek(0);
  await expect(capture.fetch(request())).rejects.toThrow(/replay/i);

  expect(upstream).toHaveBeenCalledTimes(3);
});

test.each([
  ['missing terminal', sse(events.slice(0, -1))],
  ['malformed stream', 'data: {broken}\n\n'],
  ['run error', sse([{ type: 'RUN_ERROR' }])],
  ['terminal followed by malformed data', sse() + 'data: nope\n\n'],
])('fails %s without changing response bytes', async (_name, source) => {
  const capture = createThreadplaneCapture({
    framework: 'React',
    origin: 'https://example.test',
    fetch: async () => new Response(source),
  });

  const response = await capture.fetch(request());
  const result = await response.text();

  expect(result).toBe(source);
  expect(capture.store.getSnapshot().status).toBe('error');
});

test('cancellation propagates to source and late reads cannot modify a reset store', async () => {
  const cancel = vi.fn();
  const capture = createThreadplaneCapture({
    framework: 'Angular',
    origin: 'https://example.test',
    fetch: async () => new Response(new ReadableStream({ cancel })),
  });

  const response = await capture.fetch(request());
  await response.body?.cancel();

  expect(cancel).toHaveBeenCalledOnce();
  expect(capture.store.getSnapshot().status).toBe('cancelled');
  capture.store.clear();
  expect(capture.store.getSnapshot().events).toHaveLength(0);
});

test('inspection describes actual protocol and framework runtime ownership', async () => {
  const capture = createThreadplaneCapture({
    framework: 'Angular',
    origin: 'https://example.test',
    fetch: async () => new Response(sse()),
  });

  await (await capture.fetch(request())).text();
  const json = threadplaneInspection(
    'JSON',
    capture.store.getSnapshot(),
    'Angular',
  );
  const ui = threadplaneInspection(
    'UI',
    capture.store.getSnapshot(),
    'Angular',
  );

  expect(JSON.stringify(json)).toContain('RUN_FINISHED');
  expect(JSON.stringify(ui)).toContain('provideAgent');
  expect(JSON.stringify(ui)).not.toContain('SummaryCard');
  expect(
    threadplaneInspection('Text', capture.store.getSnapshot(), 'Angular')
      ?.value,
  ).toBe('First. Second.');
});

test('mounts the genuine app, omits duplicate composer and replays captured text inertly', async () => {
  const host = document.createElement('div');
  const app = document.createElement('div');
  app.textContent = 'Genuine installed Threadplane';
  const capture = createThreadplaneCapture({
    framework: 'React',
    origin: 'https://example.test',
    fetch: async () => new Response(sse()),
  });

  const shell = mountThreadplaneWorkbench(host, app, capture);
  await (await capture.fetch(request())).text();
  capture.store.seek(capture.store.getSnapshot().events.length - 1);

  expect(shell.live.contains(app)).toBe(true);
  expect(shell.live.hidden).toBe(true);
  expect(shell.live.inert).toBe(true);
  expect(host.querySelector('.wb-composer')).toBeNull();
  expect(host.querySelector('[data-replay]')?.textContent).toContain(
    'First. Second.',
  );
  expect(
    [...host.querySelectorAll('[role=tab]')].map((node) => node.textContent),
  ).toEqual(['JSON', 'Text', 'Requests', 'UI', 'State']);
  expect(host.querySelector('[data-nav-key="cta"]')).toBeNull();
  shell.dispose();
});

test('SDK disposal after a successful terminal keeps completion, while stale source reads stay inert', async () => {
  const capture = createThreadplaneCapture({
    framework: 'React',
    origin: 'https://example.test',
    fetch: async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(sse()));
          },
        }),
      ),
  });
  const response = await capture.fetch(request());
  const reader = response.body?.getReader();

  await reader?.read();
  await reader?.cancel();

  expect(capture.store.getSnapshot().status).toBe('complete');
  const stale = createThreadplaneCapture({
    framework: 'React',
    origin: 'https://example.test',
    fetch: async () => new Response(sse()),
  });
  const staleResponse = await stale.fetch(request());
  stale.store.clear();
  await staleResponse.text();
  expect(stale.store.getSnapshot().events).toHaveLength(0);
});

test('HTTP failures and oversized response capture cannot report successful completion', async () => {
  const failed = createThreadplaneCapture({
    framework: 'React',
    origin: 'https://example.test',
    fetch: async () => new Response('denied', { status: 403 }),
  });
  const source = sse() + ' '.repeat(256001);
  const oversized = createThreadplaneCapture({
    framework: 'React',
    origin: 'https://example.test',
    fetch: async () => new Response(source),
  });

  const denied = await failed.fetch(request());
  const response = await oversized.fetch(request());

  expect(denied.status).toBe(403);
  expect(await denied.text()).toBe('denied');
  expect(failed.store.getSnapshot().status).toBe('error');
  expect(await response.text()).toBe(source);
  expect(oversized.store.getSnapshot().status).toBe('error');
});

test('provenance remains unknown without a source header and records the actual source when supplied', async () => {
  const unknown = createThreadplaneCapture({
    framework: 'React',
    origin: 'https://example.test',
    fetch: async () => new Response(sse()),
  });
  const known = createThreadplaneCapture({
    framework: 'React',
    origin: 'https://example.test',
    fetch: async () =>
      new Response(sse(), { headers: { 'X-Workbench-Source': 'openai' } }),
  });

  await (await unknown.fetch(request())).text();
  await (await known.fetch(request())).text();

  expect(
    unknown.store.getSnapshot().events.find((event) => event.kind === 'source')
      ?.payload,
  ).toMatchObject({ source: 'unknown' });
  expect(
    known.store.getSnapshot().events.find((event) => event.kind === 'source')
      ?.payload,
  ).toMatchObject({ source: 'openai' });
  expect(JSON.stringify(unknown.store.getSnapshot())).not.toContain(
    '"fixture":false',
  );
});

test('isolated Threadplane navigation lists its current topic without unhosted lesson links or reset controls', () => {
  const host = document.createElement('div');
  const app = document.createElement('div');
  const capture = createThreadplaneCapture({
    framework: 'React',
    origin: 'https://example.test',
    fetch: vi.fn(),
  });

  const shell = mountThreadplaneWorkbench(host, app, capture);

  expect(host.querySelector('.wb-nav')?.textContent).toContain('Threadplane');
  expect(host.querySelectorAll('.wb-nav a')).toHaveLength(0);
  expect(host.querySelector('[data-nav-key="cta"]')).toBeNull();
  expect(host.querySelectorAll('.wb-lessons')).toHaveLength(1);
  shell.dispose();
});

test.each([
  ['terminal without start', [{ type: 'RUN_FINISHED', ...identity }]],
  [
    'wrong run start',
    [{ type: 'RUN_STARTED', ...identity, runId: 'other' }, ...events.slice(1)],
  ],
  [
    'wrong thread finish',
    [
      ...events.slice(0, -1),
      { type: 'RUN_FINISHED', ...identity, threadId: 'other' },
    ],
  ],
  [
    'malformed text delta',
    [
      events[0],
      events[1],
      { type: 'TEXT_MESSAGE_CONTENT', messageId: 'a1', delta: { text: 'bad' } },
      events[3],
      events[4],
    ],
  ],
  ['content before message start', [events[0], events[2], events[4]]],
  [
    'mismatched message end',
    [
      ...events.slice(0, 3),
      { type: 'TEXT_MESSAGE_END', messageId: 'other' },
      events[4],
    ],
  ],
  ['unfinished text message', [...events.slice(0, 3), events[4]]],
  [
    'unknown event type',
    [events[0], { type: 'NOT_A_PROTOCOL_EVENT' }, events[4]],
  ],
])('rejects %s while forwarding exact bytes', async (_name, sourceEvents) => {
  const source = sourceEvents
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join('');
  const capture = createThreadplaneCapture({
    framework: 'React',
    origin: 'https://example.test',
    fetch: async () => new Response(source),
  });

  const response = await capture.fetch(request());

  expect(await response.text()).toBe(source);
  expect(capture.store.getSnapshot().status).toBe('error');
});

test('observing a Request preserves its original body for the real upstream transport', async () => {
  const upstream = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const forwarded = new Request(input, init);
      expect(await forwarded.json()).toEqual(envelope);
      return new Response(sse());
    },
  );
  const capture = createThreadplaneCapture({
    framework: 'React',
    origin: 'https://example.test',
    fetch: upstream,
  });

  const response = await capture.fetch(request());

  expect(await response.text()).toBe(sse());
  expect(capture.store.getSnapshot().status).toBe('complete');
});

test('a terminal observed after an actual abort cannot turn cancellation into completion', async () => {
  const abort = new AbortController();
  const capture = createThreadplaneCapture({
    framework: 'React',
    origin: 'https://example.test',
    fetch: async () => new Response(sse()),
  });

  const response = await capture.fetch(
    new Request(request(), { signal: abort.signal }),
  );
  abort.abort();
  await response.text();

  expect(capture.store.getSnapshot().status).toBe('cancelled');
  expect(
    capture.store
      .getSnapshot()
      .events.some((event) => event.kind === 'complete'),
  ).toBe(false);
});

test.each([
  null,
  { ...envelope, runId: 5 },
  { ...envelope, messages: [null] },
  {
    ...envelope,
    messages: [{ id: 'u1', role: 'user', content: { bad: true } }],
  },
])('rejects malformed input before capture or transport: %j', async (input) => {
  const upstream = vi.fn();
  const capture = createThreadplaneCapture({
    framework: 'React',
    origin: 'https://example.test',
    fetch: upstream,
  });

  await expect(
    capture.fetch('https://example.test/api/chat', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  ).rejects.toThrow();

  expect(upstream).not.toHaveBeenCalled();
  expect(capture.store.getSnapshot().events).toHaveLength(0);
});
