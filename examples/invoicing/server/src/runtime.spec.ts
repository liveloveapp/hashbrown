import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test } from 'vitest';
import { createInvoicingRuntime } from './runtime';

test('the composed B4 runtime validates the cookie and preserved schema before models run', async () => {
  const runtime = await createInvoicingRuntime();
  const server = createServer(runtime.listener);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const snapshot = await fetch(`${url}/api/snapshot`);
    const cookie = snapshot.headers.get('set-cookie')?.split(';')[0] ?? '';
    const body = JSON.stringify({
      threadId: 'thread-1',
      runId: 'run-1',
      state: { selectedPaymentId: 'payment-001' },
      hashbrown: { ui: true, responseSchema: {} },
      tools: [],
      context: [],
      forwardedProps: {},
      messages: [{ id: 'user-1', role: 'user', content: 'Review payment' }],
    });
    const invalidSchema = await fetch(`${url}/agui/%2Freview%23agent`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body,
    });
    const noSession = await fetch(`${url}/agui/%2Freview%23agent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    const threads = await fetch(`${url}/threads`);

    expect(snapshot.status).toBe(200);
    expect(invalidSchema.status).toBe(422);
    expect(noSession.status).toBe(401);
    expect(threads.status).toBe(404);
  } finally {
    await runtime.close();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  }
}, 30000);
