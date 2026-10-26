import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

/** One worker's disposable route through a cluster's stable model endpoint. */
export interface StableModelRoute {
  readonly endpoint: string;
  readonly apiKey: string;
  readonly dispose: () => void;
}

/** Owned test-only router keeping upstream endpoint identity stable across workers. */
export interface StableModelRouter {
  readonly register: (target: string) => StableModelRoute;
  readonly dispose: () => Promise<void>;
}

/** Routes isolated fixture credentials to independent model proxies without changing native bodies or paths. */
export async function createStableModelRouter(): Promise<StableModelRouter> {
  const targets = new Map<string, string>();
  const server = createServer(async (request, response) => {
    const authorization = request.headers.authorization;
    const credential =
      request.headers['api-key'] ??
      (authorization?.startsWith('Bearer ')
        ? authorization.slice(7)
        : undefined);
    const target =
      typeof credential === 'string' ? targets.get(credential) : undefined;
    if (!target) {
      response.writeHead(401);
      response.end();
      return;
    }
    const cancellation = new AbortController();
    let completed = false;
    response.once('close', () => {
      if (!completed) cancellation.abort();
    });
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (authorization) headers['Authorization'] = authorization;
      if (typeof request.headers['api-key'] === 'string')
        headers['api-key'] = request.headers['api-key'];
      const upstream = await fetch(`${target}${request.url ?? '/'}`, {
        method: request.method,
        headers,
        body: Buffer.concat(chunks),
        signal: cancellation.signal,
      });
      response.writeHead(upstream.status, {
        'Content-Type':
          upstream.headers.get('content-type') ?? 'text/event-stream',
      });
      for await (const chunk of upstream.body ?? []) response.write(chunk);
      completed = true;
      response.end();
    } catch {
      response.destroy();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    register: (target) => {
      const apiKey = crypto.randomUUID();
      targets.set(apiKey, target);
      return {
        endpoint,
        apiKey,
        dispose: () => {
          targets.delete(apiKey);
        },
      };
    },
    dispose: async () => {
      targets.clear();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
