import { readAgentBackendSettings } from './settings';
export { readAgentBackendSettings } from './settings';
import type { RunHandlerOptions } from '../run-handler';
import { createAgentRunHandler } from './handler';
import { createVisitorIdentity } from './visitor';

/** Boots one optional backend and returns its HTTP ingress and shutdown hook. */
export async function createB4runBackend(options: {
  readonly appRoot: string;
  readonly run: RunHandlerOptions;
  readonly env: NodeJS.ProcessEnv;
}) {
  const settings = readAgentBackendSettings(options.env);
  const visitors = createVisitorIdentity({
    key: settings.cookieSecret,
    secure: settings.secure,
  });
  const { createAgentRuntime } = await import('./runtime');
  const runtime = await createAgentRuntime(options);
  return {
    handler: createAgentRunHandler({ runtime, visitors }),
    close: runtime.close,
  };
}
