import { createServer } from 'node:http';
import { createInvoicingRuntime } from './runtime';

async function main() {
  if (process.env.INVOICING_ENV_FILE)
    process.loadEnvFile(process.env.INVOICING_ENV_FILE);
  if (!process.env.OPENAI_API_KEY)
    throw new Error(
      'Set OPENAI_API_KEY or INVOICING_ENV_FILE before starting the agent server.',
    );
  const runtime = await createInvoicingRuntime();
  const server = createServer(runtime.listener);
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(4325, '127.0.0.1', resolve);
    });
  } catch (error) {
    await runtime.close();
    throw error;
  }
  console.log('Invoicing agent server: http://127.0.0.1:4325');
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      server.close();
      void runtime.close().finally(() => {
        server.closeAllConnections();
      });
    });
  }
}
void main().catch(() => {
  console.error(
    'Unable to start invoicing. Check the local B4 setup and server model credentials.',
  );
  process.exitCode = 1;
});
