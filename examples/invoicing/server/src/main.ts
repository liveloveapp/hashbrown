import { createRuntimeRequestListener } from '@b4run/cli/runtime';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import handler from './api';
import middleware from './middleware';

async function main() {
  if (process.env['INVOICING_ENV_FILE'])
    process.loadEnvFile(process.env['INVOICING_ENV_FILE']);
  if (!process.env['OPENAI_API_KEY'])
    throw new Error(
      'Set OPENAI_API_KEY or INVOICING_ENV_FILE before starting the agent server.',
    );
  const runtime = await createRuntimeRequestListener({
    appRoot: fileURLToPath(new URL('..', import.meta.url)),
    middleware,
  });
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (
      path.startsWith('/agui/') ||
      path.startsWith('/threads') ||
      path === '/healthz'
    )
      runtime.listener(request, response);
    else void handler(request, response);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(4325, '127.0.0.1', resolve);
  });
  console.log('Invoicing agent server: http://127.0.0.1:4325');
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => {
      server.close();
      void runtime.close().finally(() => server.closeAllConnections());
    });
}
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
