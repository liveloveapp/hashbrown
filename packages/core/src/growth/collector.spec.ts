import { DevelopmentCollector } from './collector';
import { installBrowserStubs } from './testing/browser-stubs';
import {
  type DevelopmentTransportKind,
  ENDPOINT,
  type RuntimeEvent,
  type RuntimeOwner,
  SESSION_IDLE,
  UUID,
} from './types';

const NOW = Date.parse('2026-10-21T12:00:00.000Z');

type Sent = { schemaVersion: number; events: RuntimeEvent[] };

function owner(
  transport: DevelopmentTransportKind = 'http',
  allowed: () => boolean = () => true,
): RuntimeOwner {
  return {
    options: {
      integration: 'react',
      packageName: '@hashbrownai/react',
      packageVersion: '0.7.0',
      isDevelopment: () => true,
    },
    allowed,
    transport: () => transport,
  };
}

function acknowledge(init: RequestInit): Response {
  const body = JSON.parse(String(init.body)) as Sent;
  return new Response(
    JSON.stringify({
      schemaVersion: 1,
      events: body.events.map((event) => ({
        eventId: event.eventId,
        disposition: 'accepted',
      })),
      announcements: [],
    }),
  );
}

function setup(
  respond: (init: RequestInit) => Promise<Response> | Response = acknowledge,
) {
  jest.useFakeTimers({
    doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
  });
  jest.setSystemTime(NOW);
  const stubs = installBrowserStubs();
  const fetch = jest.fn(async (_url: string, init: RequestInit) =>
    respond(init),
  );
  const collector = new DevelopmentCollector({
    fetch: fetch as unknown as typeof globalThis.fetch,
  });
  const sent = (index = 0): Sent =>
    JSON.parse(String(fetch.mock.calls[index][1].body)) as Sent;
  return {
    collector,
    fetch,
    sent,
    restore: () => {
      collector.clear();
      stubs.restore();
      jest.useRealTimers();
    },
  };
}

test('touch enqueues the session start and a milestone and posts one batch after the interval', async () => {
  const { collector, fetch, sent, restore } = setup();
  try {
    const runtime = owner();

    collector.touch(runtime);
    collector.touch(runtime, 'tool.first_call_executed');
    await jest.advanceTimersByTimeAsync(10_000);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe(ENDPOINT);
    expect(fetch.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });
    const events = sent().events;
    expect(events.map((event) => event.kind)).toEqual([
      'runtime.session_started',
      'tool.first_call_executed',
    ]);
    for (const event of events) {
      expect(event.properties['transport']).toBe('http');
      expect(event.sessionId).toMatch(UUID);
      expect(event.eventId).toMatch(UUID);
    }
    expect(events[1].properties).toEqual({
      integration: 'react',
      packageName: '@hashbrownai/react',
      packageVersion: '0.7.0',
      transport: 'http',
    });
  } finally {
    restore();
  }
});

test('an accepted acknowledgment drains the queue and counts', async () => {
  const { collector, restore } = setup();
  try {
    const runtime = owner();

    collector.touch(runtime);
    collector.touch(runtime, 'tool.first_call_executed');
    await jest.advanceTimersByTimeAsync(10_000);

    expect(collector.diagnostics()).toEqual({
      acknowledged: 2,
      pending: 0,
      failures: 0,
      discarded: 0,
    });
  } finally {
    restore();
  }
});

test('an acknowledgment with unexpected fields is rejected', async () => {
  const { collector, restore } = setup((init) => {
    const body = JSON.parse(String(init.body)) as Sent;
    return new Response(
      JSON.stringify({
        schemaVersion: 1,
        events: body.events.map((event) => ({
          eventId: event.eventId,
          disposition: 'accepted',
          extra: true,
        })),
      }),
    );
  });
  try {
    collector.touch(owner());

    await jest.advanceTimersByTimeAsync(0);

    expect(collector.diagnostics()).toEqual({
      acknowledged: 0,
      pending: 1,
      failures: 1,
      discarded: 0,
    });
  } finally {
    restore();
  }
});

test('a response larger than 32 KiB is not acknowledged', async () => {
  const { collector, restore } = setup(
    () =>
      new Response(
        JSON.stringify({
          schemaVersion: 1,
          events: [],
          padding: 'x'.repeat(40_000),
        }),
      ),
  );
  try {
    collector.touch(owner());

    await jest.advanceTimersByTimeAsync(0);

    expect(collector.diagnostics()).toMatchObject({
      acknowledged: 0,
      pending: 1,
      failures: 1,
    });
  } finally {
    restore();
  }
});

test('a 429 with Retry-After defers the next request', async () => {
  let calls = 0;
  const { collector, fetch, restore } = setup((init) =>
    calls++ === 0
      ? new Response('{}', { status: 429, headers: { 'Retry-After': '30' } })
      : acknowledge(init),
  );
  try {
    collector.touch(owner());

    await jest.advanceTimersByTimeAsync(29_999);
    const early = fetch.mock.calls.length;
    await jest.advanceTimersByTimeAsync(1);

    expect(early).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(collector.diagnostics()).toMatchObject({
      acknowledged: 1,
      failures: 1,
      pending: 0,
    });
  } finally {
    restore();
  }
});

test('a Retry-After HTTP date defers the next request', async () => {
  let calls = 0;
  const { collector, fetch, restore } = setup((init) =>
    calls++ === 0
      ? new Response('{}', {
          status: 503,
          headers: { 'Retry-After': new Date(NOW + 60_000).toUTCString() },
        })
      : acknowledge(init),
  );
  try {
    collector.touch(owner());

    await jest.advanceTimersByTimeAsync(59_999);
    const early = fetch.mock.calls.length;
    await jest.advanceTimersByTimeAsync(1);

    expect(early).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  } finally {
    restore();
  }
});

test('a 400 exhausts attempts and discards after prune', async () => {
  const { collector, fetch, restore } = setup(
    () => new Response('{}', { status: 400 }),
  );
  try {
    const runtime = owner();
    collector.touch(runtime);
    await jest.advanceTimersByTimeAsync(60_000);

    collector.touch(runtime);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(collector.diagnostics()).toEqual({
      acknowledged: 0,
      pending: 0,
      failures: 1,
      discarded: 1,
    });
  } finally {
    restore();
  }
});

test('milestones deduplicate per integration and session', async () => {
  const { collector, sent, restore } = setup();
  try {
    const runtime = owner();

    collector.touch(runtime, 'component.first_rendered');
    collector.touch(runtime, 'component.first_rendered');
    await jest.advanceTimersByTimeAsync(0);

    expect(sent().events.map((event) => event.kind)).toEqual([
      'runtime.session_started',
      'component.first_rendered',
    ]);
  } finally {
    restore();
  }
});

test('duration buckets follow the thresholds', async () => {
  const { collector, sent, restore } = setup();
  try {
    const runtime = owner();

    for (const [index, duration] of [999, 4_999, 29_999, 30_000].entries()) {
      jest.setSystemTime(NOW + index * SESSION_IDLE);
      collector.touch(runtime, 'runtime.first_stream_completed', duration);
    }
    await jest.advanceTimersByTimeAsync(0);

    expect(
      sent()
        .events.filter(
          (event) => event.kind === 'runtime.first_stream_completed',
        )
        .map((event) => event.properties['durationBucket']),
    ).toEqual(['lt_1s', '1s_to_5s', '5s_to_30s', '30s_plus']);
  } finally {
    restore();
  }
});

test('clear aborts the in-flight request and empties the queue', async () => {
  const { collector, fetch, restore } = setup(
    (init) =>
      new Promise<Response>((_, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(new Error('aborted')),
        );
      }),
  );
  try {
    collector.touch(owner());
    await jest.advanceTimersByTimeAsync(0);
    const signal = fetch.mock.calls[0][1].signal as AbortSignal;

    collector.clear();
    await jest.advanceTimersByTimeAsync(0);

    expect(signal.aborted).toBe(true);
    expect(collector.diagnostics().pending).toBe(0);
    expect(collector.diagnostics().failures).toBe(0);
  } finally {
    restore();
  }
});

test('pending work is capped at fifty events', async () => {
  const { collector, fetch, restore } = setup();
  try {
    const runtime = owner();

    for (let round = 0; round < 15; round++) {
      jest.setSystemTime(NOW + round * SESSION_IDLE);
      collector.touch(runtime, 'runtime.first_stream_completed', 10);
      collector.touch(runtime, 'tool.first_call_executed');
      collector.touch(runtime, 'component.first_rendered');
    }

    expect(fetch).not.toHaveBeenCalled();
    expect(collector.diagnostics()).toEqual({
      acknowledged: 0,
      failures: 0,
      pending: 50,
      discarded: 10,
    });
  } finally {
    restore();
  }
});

test('a disallowed owner sends nothing', async () => {
  const { collector, fetch, restore } = setup();
  try {
    collector.touch(owner('http', () => false));

    await jest.advanceTimersByTimeAsync(60_000);

    expect(fetch).not.toHaveBeenCalled();
    expect(collector.diagnostics().pending).toBe(0);
  } finally {
    restore();
  }
});

test("the owner's run option schedules the timer and sends the request", async () => {
  let inside = false;
  const fetchedInside: boolean[] = [];
  const { collector, fetch, restore } = setup((init) => {
    fetchedInside.push(inside);
    return acknowledge(init);
  });
  const run = jest.fn((work: () => void) => {
    inside = true;
    try {
      work();
    } finally {
      inside = false;
    }
  });
  const runtime = owner();
  runtime.options = { ...runtime.options, run };
  try {
    collector.touch(runtime);
    const scheduled = run.mock.calls.length;
    await jest.advanceTimersByTimeAsync(0);

    expect(scheduled).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetchedInside).toEqual([true]);
    expect(run.mock.calls.length).toBeGreaterThanOrEqual(2);
  } finally {
    restore();
  }
});
