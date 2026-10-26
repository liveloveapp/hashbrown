import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createStableModelRouter } from '../harness/stable-model-router';

test('keeps model identity stable while routing workers independently and rejecting retired credentials', async () => {
  const servers: Server[] = [];
  const target = async (name: string) => {
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      response.setHeader('Content-Type', 'application/json');
      response.end(
        JSON.stringify({
          name,
          path: request.url,
          body: JSON.parse(Buffer.concat(chunks).toString()),
        }),
      );
    });
    servers.push(server);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  };
  const router = await createStableModelRouter();
  try {
    const a = router.register(await target('a'));
    const b = router.register(await target('b'));

    const results = await Promise.all(
      ([a, b] as const).map(async (route, index) => {
        const response = await fetch(
          `${route.endpoint}/openai/v1/responses?api-version=fixture`,
          {
            method: 'POST',
            headers:
              index === 0
                ? { Authorization: `Bearer ${route.apiKey}` }
                : { 'api-key': route.apiKey },
            body: JSON.stringify({ worker: index }),
          },
        );
        return response.json();
      }),
    );
    a.dispose();
    const retired = await fetch(`${a.endpoint}/v1/responses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${a.apiKey}` },
      body: '{}',
    });
    const unknown = await fetch(`${b.endpoint}/v1/responses`, {
      method: 'POST',
      body: '{}',
    });

    expect(a.endpoint).toBe(b.endpoint);
    expect(a.apiKey).not.toBe(b.apiKey);
    expect(results).toEqual([
      {
        name: 'a',
        path: '/openai/v1/responses?api-version=fixture',
        body: { worker: 0 },
      },
      {
        name: 'b',
        path: '/openai/v1/responses?api-version=fixture',
        body: { worker: 1 },
      },
    ]);
    expect(retired.status).toBe(401);
    expect(unknown.status).toBe(401);
  } finally {
    await router.dispose();
    for (const server of servers) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
});

test('propagates downstream cancellation through the stable endpoint', async () => {
  let upstreamClosed!: () => void;
  const closed = new Promise<void>((resolve) => {
    upstreamClosed = resolve;
  });
  const server = createServer((_request, response) => {
    response.once('close', upstreamClosed);
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.write('data: first\n\n');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const router = await createStableModelRouter();
  const route = router.register(
    `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
  );
  const cancellation = new AbortController();
  try {
    const response = await fetch(`${route.endpoint}/v1/responses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${route.apiKey}` },
      body: '{}',
      signal: cancellation.signal,
    });
    if (!response.body) throw new Error('Expected the upstream stream body.');
    const first = await response.body.getReader().read();
    cancellation.abort();
    await closed;

    expect(new TextDecoder().decode(first.value)).toBe('data: first\n\n');
  } finally {
    cancellation.abort();
    await router.dispose();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
