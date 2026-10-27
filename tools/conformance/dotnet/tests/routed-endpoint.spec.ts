import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { withRoutedEndpoint } from '../harness/routed-endpoint';
import { expectNativeRunCapture } from '../harness/native-wire';

test('diagnostic capture stays bounded and UTF-8 safe while forwarding an oversized response unchanged', async () => {
  const limit = 1024 * 1024;
  const prefix = Buffer.alloc(limit - 1, 'a');
  const payload = Buffer.concat([prefix, Buffer.from('🙂tail'.repeat(4096))]);
  const server = createServer((_, response) => {
    response.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    response.write(payload.subarray(0, limit));
    response.end(payload.subarray(limit));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await withRoutedEndpoint(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}/run`,
      async (endpoint) => {
        const response = await fetch(endpoint.url);

        const received = Buffer.from(await response.arrayBuffer());

        expect(received.equals(payload)).toBe(true);
        expect(endpoint.responses[0].truncated).toBe(true);
        expect(endpoint.responses[0].complete).toBe(false);
        expect(
          Buffer.byteLength(endpoint.responses[0].body),
        ).toBeLessThanOrEqual(limit);
        expect(endpoint.responses[0].body).toBe(prefix.toString('utf8'));
      },
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('complete response capture preserves a UTF-8 character split across transport writes', async () => {
  const payload = Buffer.from('before🙂after');
  const server = createServer((_, response) => {
    response.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    response.write(payload.subarray(0, 8));
    setImmediate(() => response.end(payload.subarray(8)));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await withRoutedEndpoint(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}/run`,
      async (endpoint) => {
        const response = await fetch(endpoint.url);

        const received = Buffer.from(await response.arrayBuffer());

        expect(received.equals(payload)).toBe(true);
        expect(endpoint.responses[0]).toEqual({
          body: 'before🙂after',
          truncated: false,
          complete: true,
        });
      },
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('a complete terminal protocol capture remains valid when its client cancels before HTTP EOF', async () => {
  const payload =
    'data: {"type":"RUN_STARTED"}\n\ndata: {"type":"RUN_FINISHED"}\n\n';
  let observeClose!: () => void;
  const closed = new Promise<void>((resolve) => {
    observeClose = resolve;
  });
  const server = createServer((_, response) => {
    response.on('close', observeClose);
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.write(payload);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await withRoutedEndpoint(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}/run`,
      async (endpoint) => {
        const response = await fetch(endpoint.url);
        if (response.body === null) {
          throw new Error('Fixture response body is missing');
        }
        const reader = response.body.getReader();
        let received = '';
        while (!received.endsWith('\n\n')) {
          const chunk = await reader.read();
          if (chunk.done) throw new Error('Fixture ended before its terminal');
          received += Buffer.from(chunk.value).toString('utf8');
        }

        await reader.cancel();
        await closed;
        const events = expectNativeRunCapture(endpoint.responses[0]);

        expect(received).toBe(payload);
        expect(endpoint.responses[0].complete).toBe(false);
        expect(events).toHaveLength(2);
        expect(() =>
          expectNativeRunCapture({
            body: payload.slice(0, -1),
            truncated: false,
          }),
        ).toThrow();
        expect(() =>
          expectNativeRunCapture({ body: payload, truncated: true }),
        ).toThrow();
      },
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
