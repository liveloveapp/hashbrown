import { EventSchemas, EventType } from '@ag-ui/core';
import { startIndependentEndpoint } from './independent-endpoint';
import { createEventGate } from './event-gate';

const input = {
  threadId: 'independent-thread',
  runId: 'independent-run',
  messages: [{ id: 'user-1', role: 'user', content: 'Hello' }],
  tools: [],
  context: [],
  state: {},
  forwardedProps: {},
};

for (const terminal of [
  undefined,
  { threadId: 'wrong-thread', runId: input.runId },
  { threadId: input.threadId, runId: 'wrong-run' },
]) {
  test(`does not record absent or mismatched terminal ${JSON.stringify(terminal)}`, async () => {
    const endpoint = await startIndependentEndpoint({
      events: () =>
        terminal ? [{ type: EventType.RUN_FINISHED, ...terminal }] : [],
    });

    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        body: JSON.stringify(input),
      });
      await response.text();

      expect(endpoint.consumeTerminalRun(input.runId)).toBe(false);
    } finally {
      await endpoint.stop();
    }
  });
}

test('gated HTTP delivery exposes a partial body before the terminal is released', async () => {
  const gate = createEventGate();
  const endpoint = await startIndependentEndpoint({
    beforeEvent: gate.wait,
    events: () => [
      {
        type: EventType.RUN_STARTED,
        threadId: input.threadId,
        runId: input.runId,
      },
      {
        type: EventType.RUN_FINISHED,
        threadId: input.threadId,
        runId: input.runId,
      },
    ],
  });

  try {
    gate.releaseThrough(0);
    const response = await fetch(endpoint.url, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    if (!response.body) throw new Error('Expected an SSE response body');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let partial = '';
    while (!partial.includes('\n\n')) {
      const chunk = await reader.read();
      if (chunk.done)
        throw new Error('Stream ended before the first SSE frame');
      partial += decoder.decode(chunk.value, { stream: true });
    }

    expect(partial).toContain('RUN_STARTED');
    expect(partial).not.toContain('RUN_FINISHED');
    expect(endpoint.consumeTerminalRun(input.runId)).toBe(false);
    gate.releaseThrough(1);
    let rest = '';
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      rest += decoder.decode(chunk.value, { stream: true });
    }
    rest += decoder.decode();
    expect(rest).toContain('RUN_FINISHED');
    expect(endpoint.consumeTerminalRun(input.runId)).toBe(true);
    expect(endpoint.consumeTerminalRun(input.runId)).toBe(false);
  } finally {
    await endpoint.stop();
  }
});

test('stopping the endpoint aborts a blocked delivery gate', async () => {
  const gate = createEventGate();
  let signal: AbortSignal | undefined;
  const endpoint = await startIndependentEndpoint({
    beforeEvent: (index, currentSignal) => {
      signal = currentSignal;
      return gate.wait(index, currentSignal);
    },
    events: () => [
      {
        type: EventType.RUN_STARTED,
        threadId: input.threadId,
        runId: input.runId,
      },
    ],
  });

  try {
    const response = await fetch(endpoint.url, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    const body = response.text();
    const settled = body.catch(() => 'closed');
    await endpoint.stop();

    expect(signal?.aborted).toBe(true);
    await settled;
  } finally {
    await endpoint.stop();
  }
});

test('client disconnect aborts a blocked gate without recording a terminal', async () => {
  const gate = createEventGate();
  const client = new AbortController();
  let observedAbort: Promise<void> | undefined;
  const endpoint = await startIndependentEndpoint({
    beforeEvent: (index, signal) => {
      observedAbort = new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true }),
      );
      return gate.wait(index, signal);
    },
    events: () => [
      {
        type: EventType.RUN_FINISHED,
        threadId: input.threadId,
        runId: input.runId,
      },
    ],
  });

  try {
    const response = await fetch(endpoint.url, {
      method: 'POST',
      body: JSON.stringify(input),
      signal: client.signal,
    });
    const body = response.text().catch(() => 'closed');
    client.abort();

    expect(observedAbort).toBeDefined();
    await observedAbort;
    await body;
    expect(endpoint.consumeTerminalRun(input.runId)).toBe(false);
  } finally {
    await endpoint.stop();
  }
});

test('standard endpoint parses canonical input without depending on vendor fields', async () => {
  const endpoint = await startIndependentEndpoint({
    events: (request) => [
      {
        type: EventType.RUN_STARTED,
        threadId: request.threadId,
        runId: request.runId,
      },
      {
        type: EventType.RUN_FINISHED,
        threadId: request.threadId,
        runId: request.runId,
      },
    ],
  });

  try {
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...input,
        hashbrown: { ui: true, responseSchema: { type: 'object' } },
      }),
    });
    const wire = await response.text();
    const events = wire
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => EventSchemas.parse(JSON.parse(line.slice(5))));

    expect(response.status).toBe(200);
    expect(endpoint.consumeTerminalRun('different-run')).toBe(false);
    expect(endpoint.consumeTerminalRun(input.runId)).toBe(true);
    expect(endpoint.consumeTerminalRun(input.runId)).toBe(false);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(endpoint.inputs).toEqual([input]);
    expect(events.map((event) => event.type)).toEqual([
      EventType.RUN_STARTED,
      EventType.RUN_FINISHED,
    ]);
  } finally {
    await endpoint.stop();
  }
});

test('extension-aware parsing retains and validates the response schema and UI flag', async () => {
  const extension = {
    responseSchema: {
      type: 'object',
      properties: { answer: { type: 'string' } },
    },
    ui: true,
  };
  const endpoint = await startIndependentEndpoint({
    extended: true,
    events: () => [],
  });

  try {
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, hashbrown: extension }),
    });
    await response.text();

    expect(response.status).toBe(200);
    expect(endpoint.inputs[0].hashbrown).toEqual(extension);
  } finally {
    await endpoint.stop();
  }
});

test('invalid canonical requests fail before SSE headers or event generation', async () => {
  const events = jest.fn(() => []);
  const endpoint = await startIndependentEndpoint({ events });

  try {
    const response = await fetch(endpoint.url, {
      method: 'POST',
      body: JSON.stringify({ ...input, messages: 'invalid' }),
    });

    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({ error: 'Invalid run input' });
    expect(endpoint.inputs).toEqual([]);
    expect(events).not.toHaveBeenCalled();
  } finally {
    await endpoint.stop();
  }
});

test('extension endpoint rejects a missing schema rather than silently stripping it', async () => {
  const endpoint = await startIndependentEndpoint({
    extended: true,
    events: () => [],
  });

  try {
    const response = await fetch(endpoint.url, {
      method: 'POST',
      body: JSON.stringify(input),
    });

    expect(response.status).toBe(400);
    expect(endpoint.inputs).toEqual([]);
    await response.text();
  } finally {
    await endpoint.stop();
  }
});

test('endpoint handles cross-origin preflight and repeated cleanup', async () => {
  const endpoint = await startIndependentEndpoint({ events: () => [] });

  try {
    const response = await fetch(endpoint.url, { method: 'OPTIONS' });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-methods')).toContain(
      'POST',
    );
    expect(endpoint.inputs).toEqual([]);
  } finally {
    await endpoint.stop();
    await endpoint.stop();
  }
});

test('malformed JSON is rejected without invoking the fixture', async () => {
  const events = jest.fn(() => []);
  const endpoint = await startIndependentEndpoint({ events });

  try {
    const response = await fetch(endpoint.url, { method: 'POST', body: '{' });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid run input' });
    expect(events).not.toHaveBeenCalled();
  } finally {
    await endpoint.stop();
  }
});

test('fixture errors return JSON before starting the event stream', async () => {
  const endpoint = await startIndependentEndpoint({
    events: () => {
      throw new Error('private fixture detail');
    },
  });

  try {
    const response = await fetch(endpoint.url, {
      method: 'POST',
      body: JSON.stringify(input),
    });

    expect(response.status).toBe(500);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({ error: 'Invalid fixture events' });
  } finally {
    await endpoint.stop();
  }
});

test('unsupported paths and methods cannot invoke event generation', async () => {
  const events = jest.fn(() => []);
  const endpoint = await startIndependentEndpoint({ events });

  try {
    const missing = await fetch(new URL('/missing', endpoint.url), {
      method: 'POST',
    });
    const method = await fetch(endpoint.url);

    expect(missing.status).toBe(404);
    expect(method.status).toBe(405);
    expect(events).not.toHaveBeenCalled();
    await missing.text();
    await method.text();
  } finally {
    await endpoint.stop();
  }
});
