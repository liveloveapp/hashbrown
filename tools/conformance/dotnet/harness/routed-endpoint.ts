import { once } from 'node:events';
import { createServer, request as upstreamRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { recoveryRequestRecorder } from './recovery-timings';

/** Stable browser address with captured request bodies and selectable application instance. */
export interface RoutedEndpoint {
  readonly url: string;
  readonly requests: readonly string[];
  readonly routeTo: (target: string) => void;
}

/** Relays actual HTTP/SSE bytes while routing each new request to the selected worker. */
export async function withRoutedEndpoint<T>(
  initialTarget: string,
  use: (endpoint: RoutedEndpoint) => Promise<T>,
): Promise<T> {
  let target = initialTarget;
  const requests: string[] = [];
  const beginTrace = recoveryRequestRecorder('route');
  const routeTrace = beginTrace();
  const server = createServer(async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Accept, Authorization, X-Fixture-Principal',
    );
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (request.method === 'OPTIONS') {
      response.writeHead(204).end();
      return;
    }
    const trace = beginTrace();
    try {
      const destination = new URL(
        request.url ?? '/run',
        new URL(target).origin,
      );
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks);
      if (destination.pathname === '/run') requests.push(body.toString('utf8'));
      const upstream = upstreamRequest(destination, {
        method: request.method,
        headers: {
          'Content-Type': request.headers['content-type'] ?? 'application/json',
          Accept: request.headers.accept ?? 'text/event-stream',
          ...(request.headers.authorization
            ? { Authorization: request.headers.authorization }
            : {}),
          ...(request.headers['x-fixture-principal']
            ? { 'X-Fixture-Principal': request.headers['x-fixture-principal'] }
            : {}),
        },
      });
      response.once('close', () => {
        if (!response.writableFinished) trace('cancel');
        upstream.destroy();
      });
      response.on('drain', () => trace('drain'));
      upstream.once('response', (result) => {
        trace('upstream-headers', result.statusCode);
        result.once('data', () => trace('first-byte'));
        result.once('end', () => trace('end'));
        response.writeHead(result.statusCode ?? 502, {
          'Content-Type': result.headers['content-type'] ?? 'text/event-stream',
          ...(result.headers['cache-control']
            ? { 'Cache-Control': result.headers['cache-control'] }
            : {}),
        });
        result.once('error', () => {
          trace('error');
          response.destroy();
        });
        result.pipe(response);
      });
      upstream.once('error', () => {
        trace('error');
        response.destroy();
      });
      upstream.end(body);
    } catch {
      trace('error');
      response.destroy();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    return await use({
      url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/run`,
      requests,
      routeTo: (destination) => {
        target = destination;
        routeTrace('route-change');
      },
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
