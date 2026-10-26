import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

/** Relays real .NET events, closing at the first text delta to test missing-terminal handling. */
export async function withTruncatedEndpoint<T>(
  target: string,
  use: (url: string) => Promise<T>,
): Promise<T> {
  const server = createServer(async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (request.method === 'OPTIONS') {
      response.writeHead(204).end();
      return;
    }
    const cancellation = new AbortController();
    response.once('close', () => cancellation.abort());
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const upstream = await fetch(target, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: Buffer.concat(chunks),
        signal: cancellation.signal,
      });
      response.writeHead(upstream.status, {
        'Content-Type': 'text/event-stream',
      });
      const decoder = new TextDecoder();
      let pending = '';
      for await (const chunk of upstream.body ?? []) {
        pending += decoder.decode(chunk, { stream: true });
        let boundary = pending.indexOf('\n\n');
        while (boundary !== -1) {
          const frame = pending.slice(0, boundary + 2);
          pending = pending.slice(boundary + 2);
          response.write(frame);
          if (/"type"\s*:\s*"TEXT_MESSAGE_CONTENT"/.test(frame)) {
            response.end();
            cancellation.abort();
            return;
          }
          boundary = pending.indexOf('\n\n');
        }
      }
      response.end(pending);
    } catch {
      response.destroy();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    return await use(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}/run`,
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
