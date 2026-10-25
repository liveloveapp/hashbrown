import { once } from 'node:events';
import { createServer } from 'node:http';
import { withRoutedEndpoint } from '../harness/routed-endpoint';
import {
  createRecoveryTimeline,
  traceRecoveryRequest,
  withRecoveryTimeline,
} from '../harness/recovery-timings';

test('caps retained events and request identities while recording overflow', () => {
  const timeline = createRecoveryTimeline();

  for (let request = 0; request < 40; request++) {
    const trace = timeline.request('route');
    for (let event = 0; event < 12; event++) trace('first-byte');
  }
  const snapshot = timeline.snapshot();

  expect(snapshot.events).toHaveLength(256);
  expect(snapshot.requests).toBe(32);
  expect(snapshot.droppedRequests).toBe(8);
  expect(snapshot.droppedEvents).toBe(264);
  expect(
    new Set(snapshot.events.map((event) => event.requestId)).size,
  ).toBeLessThanOrEqual(32);
  expect(
    snapshot.events.every(
      (event, index) =>
        index === 0 || event.elapsedMs >= snapshot.events[index - 1].elapsedMs,
    ),
  ).toBe(true);
});

test('isolates concurrent asynchronous scopes and returns detached snapshots', async () => {
  const first = createRecoveryTimeline();
  const second = createRecoveryTimeline();

  await Promise.all([
    withRecoveryTimeline(first, async () => {
      const trace = traceRecoveryRequest('route');
      await Promise.resolve();
      trace('cancel');
    }),
    withRecoveryTimeline(second, async () => {
      await Promise.resolve();
      traceRecoveryRequest('model')('end');
    }),
  ]);
  const detached = first.snapshot();
  detached.events.length = 0;

  expect(first.snapshot().events.map((event) => event.phase)).toEqual([
    'request',
    'cancel',
  ]);
  expect(second.snapshot().events.map((event) => event.component)).toEqual([
    'model',
    'model',
  ]);
  expect(JSON.stringify(first.snapshot())).not.toMatch(
    /url|body|errorText|threadId/,
  );
});

test('records only numeric HTTP statuses and fixed phase names', () => {
  const timeline = createRecoveryTimeline();

  const trace = timeline.request('model');
  trace('upstream-headers', 200);
  trace('error');

  expect(
    timeline.snapshot().events.map(({ component, phase, status }) => ({
      component,
      phase,
      status,
    })),
  ).toEqual([
    { component: 'model', phase: 'request', status: undefined },
    { component: 'model', phase: 'upstream-headers', status: 200 },
    { component: 'model', phase: 'error', status: undefined },
  ]);
});

test('distinguishes routed upstream headers from first bytes and observes client cancellation', async () => {
  let accepted!: (response: import('node:http').ServerResponse) => void;
  const received = new Promise<import('node:http').ServerResponse>(
    (resolve) => {
      accepted = resolve;
    },
  );
  const upstream = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.flushHeaders();
    accepted(response);
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address() as import('node:net').AddressInfo;
  const timeline = createRecoveryTimeline();

  try {
    await withRecoveryTimeline(timeline, () =>
      withRoutedEndpoint(
        `http://127.0.0.1:${address.port}/run`,
        async (endpoint) => {
          const cancellation = new AbortController();
          const fetching = fetch(endpoint.url, { signal: cancellation.signal });
          const response = await received;
          try {
            for (
              let attempt = 0;
              attempt < 100 &&
              !timeline
                .snapshot()
                .events.some((event) => event.phase === 'upstream-headers');
              attempt++
            ) {
              await new Promise((resolve) => setTimeout(resolve, 5));
            }
            expect(
              timeline
                .snapshot()
                .events.some((event) => event.phase === 'upstream-headers'),
            ).toBe(true);
            expect(
              timeline
                .snapshot()
                .events.some((event) => event.phase === 'first-byte'),
            ).toBe(false);
            response.write('data: {}\n\n');
            const browser = await fetching;
            if (!browser.body)
              throw new Error('Expected streamed response body');
            const reader = browser.body.getReader();
            expect((await reader.read()).value?.length).toBeGreaterThan(0);
            const closed = once(response, 'close');
            cancellation.abort();
            await closed;
          } finally {
            cancellation.abort();
            response.destroy();
            await fetching.catch(() => undefined);
          }
        },
      ),
    );

    expect(timeline.snapshot().events.map((event) => event.phase)).toEqual(
      expect.arrayContaining([
        'request',
        'upstream-headers',
        'first-byte',
        'cancel',
      ]),
    );
    expect(
      timeline.snapshot().events.some((event) => event.phase === 'end'),
    ).toBe(false);
  } finally {
    upstream.closeAllConnections();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});

test('observes a large routed response without consuming or changing streamed bytes', async () => {
  const content = 'x'.repeat(2 * 1024 * 1024);
  const upstream = createServer((_request, response) => response.end(content));
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address() as import('node:net').AddressInfo;
  const timeline = createRecoveryTimeline();

  try {
    const actual = await withRecoveryTimeline(timeline, () =>
      withRoutedEndpoint(
        `http://127.0.0.1:${address.port}/run`,
        async (endpoint) => (await fetch(endpoint.url)).text(),
      ),
    );

    expect(actual).toBe(content);
    expect(timeline.snapshot().events.map((event) => event.phase)).toEqual(
      expect.arrayContaining(['first-byte', 'drain', 'end']),
    );
    expect(
      timeline.snapshot().events.some((event) => event.phase === 'cancel'),
    ).toBe(false);
  } finally {
    upstream.closeAllConnections();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});
