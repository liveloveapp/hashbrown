import { expect, test } from 'vitest';
import { createServer } from 'node:http';
import { createWorkbenchApp } from '../examples/quickstart/server/workbench-app';
import { workbenchHistorySystem } from '../examples/quickstart/runtime/workbench-history';
import { EventType } from '@ag-ui/core';

test('isolates demo sessions, enforces auth and origin, and detects real competing writes', async () => {
  const calls: unknown[] = [];
  const server = createServer(
    createWorkbenchApp({
      source: 'test-fixture',
      stream: async function* (input, _signal, lesson) {
        calls.push({ input, lesson });
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
  if (!address || typeof address === 'string') throw new Error('No port');
  const origin = `http://127.0.0.1:${address.port}`;
  const root = `${origin}/api/workbench/server`;
  const headers = { Origin: origin, 'Content-Type': 'application/json' };

  try {
    expect((await fetch(`${root}/session`)).status).toBe(200);
    expect((await fetch(`${root}/session`, { method: 'POST' })).status).toBe(
      403,
    );
    const started = await fetch(`${root}/session`, { method: 'POST', headers });
    const cookie = started.headers.get('set-cookie')?.split(';')[0] ?? '';
    expect(started.headers.get('set-cookie')).toContain('HttpOnly');
    expect(started.headers.get('set-cookie')).toContain('SameSite=Strict');
    const session = await started.json();
    const h = { ...headers, Cookie: cookie };
    const thread = `${root}/server-threads/threads/${session.threads['server-threads'].Lighthouse}`;
    expect((await fetch(thread)).status).toBe(401);
    expect(
      (
        await fetch(
          `${root}/server-threads/threads/${session.foreignThreadId}`,
          { headers: h },
        )
      ).status,
    ).toBe(404);
    expect((await fetch(thread, { headers: h })).status).toBe(200);
    const messages = [
      { role: 'user', content: 'Lighthouse' },
      { role: 'assistant', content: 'Outline and record.' },
    ];
    const save = () =>
      fetch(thread, {
        method: 'PUT',
        headers: h,
        body: JSON.stringify({ expectedVersion: 0, messages }),
      });
    expect((await save()).status).toBe(200);
    expect((await save()).status).toBe(409);
    expect(
      (
        await fetch(thread, {
          method: 'PUT',
          headers: h,
          body: JSON.stringify({
            expectedVersion: 1,
            messages: [{ role: 'assistant', content: 'x'.repeat(2001) }],
          }),
        })
      ).status,
    ).toBe(400);
    const body = JSON.stringify({
      threadId: session.threads['server-threads'].Lighthouse,
      runId: 'r',
      messages: [{ id: 'u', role: 'user', content: 'Plan' }],
      tools: [],
      state: {},
      context: [],
      forwardedProps: { model: 'attacker' },
    });
    expect(
      (
        await fetch(`${root}/server-threads/chat`, {
          method: 'POST',
          headers,
          body,
        })
      ).status,
    ).toBe(401);
    const response = await fetch(`${root}/server-threads/chat`, {
      method: 'POST',
      headers: h,
      body,
    });
    expect(response.status).toBe(200);
    await response.text();
    expect(calls).toMatchObject([
      {
        lesson: 'server-threads',
        input: {
          messages: [{ content: workbenchHistorySystem }, { content: 'Plan' }],
          forwardedProps: {},
        },
      },
    ]);
    const other = await fetch(`${root}/session`, { method: 'POST', headers });
    expect((await other.json()).threads).not.toEqual(session.threads);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
});

test('denies wrong origins, malformed input and admission before provider calls', async () => {
  let calls = 0;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const server = createServer(
    createWorkbenchApp({
      stream: async function* (input) {
        calls++;
        yield {
          type: EventType.RUN_STARTED,
          threadId: input.threadId,
          runId: input.runId,
        };
        await gate;
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
  if (!address || typeof address === 'string') throw new Error('No port');
  const origin = `http://127.0.0.1:${address.port}`;
  const root = `${origin}/api/workbench/server`;
  try {
    const started = await fetch(`${root}/session`, {
      method: 'POST',
      headers: { Origin: origin },
    });
    const session = await started.json();
    const headers = {
      Origin: origin,
      'Content-Type': 'application/json',
      Cookie: started.headers.get('set-cookie')?.split(';')[0] ?? '',
    };
    const endpoint = `${root}/public-endpoint/chat`;
    const input = {
      threadId: session.threads['public-endpoint'].Lighthouse,
      runId: 'run',
      tools: [],
      state: {},
      context: [],
      messages: [{ id: 'u', role: 'user', content: 'Lighthouse' }],
    };
    expect(
      (
        await fetch(endpoint, {
          method: 'POST',
          headers: { ...headers, Origin: 'http://evil.example' },
          body: JSON.stringify(input),
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            ...input,
            messages: [{ id: 'u', role: 'user', content: 'x'.repeat(2001) }],
          }),
        })
      ).status,
    ).toBe(400);
    expect(calls).toBe(0);
    const first = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    const second = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    const denied = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    expect(denied.status).toBe(429);
    expect(calls).toBe(2);
    release?.();
    await Promise.all([first.text(), second.text()]);
  } finally {
    release?.();
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
});
