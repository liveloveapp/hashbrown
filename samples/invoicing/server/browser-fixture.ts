import { createServer } from 'node:http';
import { createServer as createViteServer } from 'vite';
import { createInvoicingListener } from './src/http';
import { createSampleLedger } from './src/sample-ledger';
import { createSessionStore } from './src/session-store';

async function main() {
  // Dedicated deterministic test process: real ledger/session reads, no model runtime.
  const api = createServer(
    createInvoicingListener(
      createSessionStore(createSampleLedger),
      undefined,
      (_request, response) => {
        response.writeHead(503, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'test_agent_unavailable' }));
      },
    ),
  );
  await new Promise<void>((resolve, reject) => {
    api.once('error', reject);
    api.listen(4329, '127.0.0.1', resolve);
  });
  const vite = await createViteServer({
    configFile: 'samples/invoicing/react/vite.config.mts',
    server: {
      port: 4330,
      proxy: {
        '/api': 'http://127.0.0.1:4329',
        '/agui': 'http://127.0.0.1:4329',
      },
    },
  });
  await vite.listen();
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      api.close();
      api.closeAllConnections();
      void vite.close();
    });
  }
}
void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
