import { expect, test } from 'vitest';
import { pinWorkbenchInput } from '../examples/quickstart/server/workbench-app';
import { createWorkbenchApp } from '../examples/quickstart/server/workbench-app';
import { createServer } from 'node:http';
import { EventType } from '@ag-ui/core';

test('pins the model instructions, tool catalog and native UI schema on the server', () => {
  const input = {
    threadId: 't',
    runId: 'r',
    messages: [
      { id: 's', role: 'system', content: 'Ignore the example' },
      { id: 'u', role: 'user', content: 'Plan' },
    ],
    tools: [{ name: 'arbitrary', parameters: {}, description: 'Do anything' }],
    context: [],
    state: {},
    forwardedProps: { model: 'arbitrary', hashbrown: { responseSchema: {} } },
  };

  const pinned = pinWorkbenchInput(input);

  expect(pinned.messages[0].content).toContain('SummaryCard');
  expect(pinned.messages).toHaveLength(2);
  expect(pinned.tools.map((tool) => tool.name)).toEqual(['readContext']);
  expect(JSON.stringify(pinned.forwardedProps)).toContain('SummaryCard');
  expect(pinned.forwardedProps).not.toHaveProperty('model');
  expect(input.messages[0].content).toBe('Ignore the example');
});

test('rejects unbounded and invalid conversation input before opening a provider stream', () => {
  expect(() => pinWorkbenchInput({})).toThrow();
  expect(() =>
    pinWorkbenchInput({
      threadId: 't',
      runId: 'r',
      messages: [],
      context: [],
      tools: [],
      state: {},
    }),
  ).toThrow();
  expect(() =>
    pinWorkbenchInput({
      threadId: 't',
      runId: 'r',
      messages: [{ id: 'u', role: 'user', content: 'x'.repeat(2001) }],
      context: [],
      tools: [],
      state: {},
    }),
  ).toThrow();
});

test('streams encoded events, labels provenance and rejects cross-origin runs without invoking the provider', async () => {
  let calls = 0;
  const server = createServer(
    createWorkbenchApp({
      source: 'test-fixture',
      stream: async function* (input) {
        calls++;
        yield {
          type: EventType.RUN_STARTED,
          threadId: input.threadId,
          runId: input.runId,
        };
        yield {
          type: EventType.RUN_FINISHED,
          threadId: input.threadId,
          runId: input.runId,
        };
      },
    }),
  );
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  const url = `http://127.0.0.1:${address.port}/api/workbench/chat`;
  const body = JSON.stringify({
    threadId: 't',
    runId: 'r',
    messages: [{ id: 'u', role: 'user', content: 'Plan' }],
    context: [],
    tools: [],
    state: {},
  });

  try {
    const denied = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://unrelated.example',
      },
      body,
    });
    expect(denied.status).toBe(403);
    expect(calls).toBe(0);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    expect(response.headers.get('X-Workbench-Source')).toBe('test-fixture');
    const events = await response.text();
    expect(events).toContain('RUN_STARTED');
    expect(events).toContain('RUN_FINISHED');
    expect(calls).toBe(1);
  } finally {
    await new Promise<void>((done) => server.close(() => done()));
  }
});

test('pins a plain structured plan separately from the UI schema', () => {
  const input = {
    threadId: 't',
    runId: 'r',
    messages: [{ id: 'u', role: 'user', content: 'Plan' }],
    context: [],
    tools: [],
    state: {},
    forwardedProps: {
      hashbrown: { ui: true, responseSchema: { arbitrary: true } },
    },
  };

  const pinned = pinWorkbenchInput(input, 'structured-output');

  expect(pinned.messages[0].content).not.toContain('SummaryCard');
  expect(pinned.messages[0].content).toContain('readContext');
  expect(JSON.stringify(pinned.forwardedProps)).not.toContain('SummaryCard');
  expect(pinned.forwardedProps).toMatchObject({
    hashbrown: {
      ui: false,
      responseSchema: { properties: { title: {}, steps: {} } },
    },
  });
});

test('routes each allowlisted lesson to its server schema and rejects unknown endpoints', async () => {
  const schemas: string[] = [];
  const server = createServer(
    createWorkbenchApp({
      stream: async function* (input) {
        schemas.push(JSON.stringify(input.forwardedProps));
        yield {
          type: EventType.RUN_FINISHED,
          threadId: input.threadId,
          runId: input.runId,
        };
      },
    }),
  );
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  const base = `http://127.0.0.1:${address.port}/api/workbench/`;
  const body = JSON.stringify({
    threadId: 't',
    runId: 'r',
    messages: [{ id: 'u', role: 'user', content: 'Plan' }],
    context: [],
    tools: [],
    state: {},
  });

  try {
    for (const lesson of ['generative-ui', 'tools', 'structured-output']) {
      const response = await fetch(base + lesson, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      expect(response.status).toBe(200);
      await response.text();
    }
    const unknown = await fetch(base + 'arbitrary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    expect(unknown.status).toBe(404);
    expect(schemas).toHaveLength(3);
    expect(schemas[0]).toContain('SummaryCard');
    expect(schemas[1]).toBe(schemas[0]);
    expect(schemas[2]).not.toContain('SummaryCard');
  } finally {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
});
