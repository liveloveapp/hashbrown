import { createApp, createChatService } from '@atc/server';
import { LLMock } from '@copilotkit/aimock';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { PROMPTS } from '../model';
import { NO_FILTERS, scenario } from '../traffic-fixtures';

async function main(): Promise<void> {
  const backend = process.argv[2];
  if (backend !== 'openai' && backend !== 'b4run')
    throw new Error('Unknown backend');
  const dist = resolve('dist/examples/atc');
  const mock = new LLMock({ port: 0, chunkSize: 8 });
  const prefix = backend === 'b4run' ? 'client_' : '';
  mock.onToolResult('highlight-highest', {
    content: JSON.stringify({
      ui: [
        {
          FlightCard: {
            props: {
              hex: scenario.highest.hex,
              note: 'The highest aircraft.',
            },
          },
        },
      ],
    }),
  });
  mock.onToolResult('find-highest', {
    toolCalls: [
      {
        id: 'highlight-highest',
        name: `${prefix}highlightAircraft`,
        arguments: { hexes: [scenario.highest.hex] },
      },
    ],
  });
  mock.onMessage(PROMPTS.reasoned, {
    toolCalls: [
      {
        id: 'find-highest',
        name: `${prefix}findAircraft`,
        arguments: { ...NO_FILTERS, sortBy: 'altitude', limit: 1 },
      },
    ],
  });
  await mock.start();
  process.env.OPENAI_API_KEY = 'fixture-only';
  process.env.OPENAI_BASE_URL = `${mock.url}/v1`;
  const appRoot = await mkdtemp(resolve(tmpdir(), 'atc-backend-browser-'));
  const run = {
    apiKey: 'fixture-only',
    baseURL: `${mock.url}/v1`,
    model: 'gpt-5-mini',
  };
  const chat = await createChatService({
    run,
    env: { ATC_CHAT_BACKEND: backend },
    appRoot,
  }).catch(async (error: unknown) => {
    await mock.stop();
    await rm(appRoot, { recursive: true, force: true });
    throw error;
  });
  const server = createApp({
    run,
    chatHandler: chat.handler,
    statics: [
      { path: '/angular', dir: resolve(dist, 'angular/browser') },
      { path: '/react', dir: resolve(dist, 'react') },
    ],
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  process.send?.({ origin });
  async function close() {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
    await chat.close();
    await mock.stop();
    await rm(appRoot, { recursive: true, force: true });
    process.exit(0);
  }
  process.once('SIGTERM', () => void close());
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
