import { createApp } from './app';
import { createChatService } from './chat-service';
import { readRunOptions } from './run-handler';

try {
  process.loadEnvFile();
} catch {
  // No .env file; rely on the environment.
}

async function main(): Promise<void> {
  const run = readRunOptions(process.env);
  const chat = await createChatService({ run, env: process.env });
  const port = Number(process.env['PORT'] ?? 4340);
  const server = createApp({ run, chatHandler: chat.handler }).listen(
    port,
    '127.0.0.1',
    () => {
      console.log(`atc server on http://127.0.0.1:${port}`);
    },
  );
  const close = () => {
    server.close();
    void chat.close().catch((error) => {
      console.error('[atc] chat shutdown failed', error);
      process.exitCode = 1;
    });
  };
  process.once('SIGTERM', close);
  process.once('SIGINT', close);
}

void main().catch((error) => {
  console.error('[atc] server startup failed', error);
  process.exitCode = 1;
});
