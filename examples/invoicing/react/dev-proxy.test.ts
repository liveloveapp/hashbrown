// @vitest-environment node
import { createServer as createHttpServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createServer as createViteServer } from 'vite';
import { expect, test } from 'vitest';
import { agentProxy } from './dev-proxy';

const listen = (server: Server) =>
  new Promise<number>((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve((server.address() as AddressInfo).port),
    ),
  );

/** A Vite dev server proxying `/agui` to an agent server that runs `handler`. */
async function proxied(handler: Parameters<typeof createHttpServer>[1]) {
  const agent = createHttpServer(handler);
  const agentPort = await listen(agent);
  const vite = await createViteServer({
    configFile: false,
    root: import.meta.dirname,
    appType: 'custom',
    logLevel: 'silent',
    server: {
      host: '127.0.0.1',
      port: 0,
      ws: false,
      proxy: { '/agui': agentProxy(`http://127.0.0.1:${agentPort}`) },
    },
  });
  await vite.listen();
  const vitePort = (vite.httpServer?.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${vitePort}/agui/run`,
    async close() {
      await vite.close();
      agent.closeAllConnections();
      agent.close();
    },
  };
}

/** How a response body finished: read in full, failed, or still open after 3 s. */
const settle = (response: Response) =>
  Promise.race([
    response.text().then(
      (body) => ({ outcome: 'ended', body }),
      () => ({ outcome: 'errored' }),
    ),
    new Promise((resolve) =>
      setTimeout(() => resolve({ outcome: 'hung' }), 3000),
    ),
  ]);

test('the dev proxy ends the browser stream when the agent server dies mid-run', async () => {
  const server = await proxied((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.write('data: {"type":"RUN_STARTED"}\n\n');
    setTimeout(() => response.socket?.destroy(), 50);
  });

  const response = await fetch(server.url, { method: 'POST' });
  const result = await settle(response);
  await server.close();

  expect(response.status).toBe(200);
  expect(result).toEqual({ outcome: 'errored' });
});

test('the dev proxy passes a finished stream through whole', async () => {
  const server = await proxied((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.write('data: {"type":"RUN_STARTED"}\n\n');
    setTimeout(() => response.end('data: {"type":"RUN_FINISHED"}\n\n'), 50);
  });

  const response = await fetch(server.url, { method: 'POST' });
  const result = await settle(response);
  await server.close();

  expect(result).toEqual({
    outcome: 'ended',
    body: 'data: {"type":"RUN_STARTED"}\n\ndata: {"type":"RUN_FINISHED"}\n\n',
  });
});
