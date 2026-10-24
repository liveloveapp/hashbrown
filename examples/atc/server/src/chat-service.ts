import { resolve } from 'node:path';
import { createChatHandler, readChatBackend } from './chat-backend';
import { createRunHandler, type RunHandlerOptions } from './run-handler';

/** Boots the selected chat service once; the default path imports no agent runtime. */
export async function createChatService(options: {
  readonly run: RunHandlerOptions;
  readonly env: NodeJS.ProcessEnv;
  readonly appRoot?: string;
}) {
  let close: () => Promise<void> = async () => undefined;
  const handler = await createChatHandler(
    readChatBackend(options.env['ATC_CHAT_BACKEND']),
    {
      openai: () => createRunHandler(options.run),
      b4run: async () => {
        const { createB4runBackend } = await import('./b4run/backend');
        const service = await createB4runBackend({
          ...options,
          appRoot: options.appRoot ?? resolve('examples/atc/server'),
        });
        close = service.close;
        return service.handler;
      },
    },
  );
  return { handler, close: () => close() };
}
