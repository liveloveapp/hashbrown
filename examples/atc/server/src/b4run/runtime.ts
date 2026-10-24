import {
  buildStaticRouteModule,
  createRuntimeFetchHandler,
} from '@b4run/cli/runtime';
import auth from '../auth';
import { createAtcThreadPolicy, THREAD_LIFETIME_MS } from './thread-policy';
import { ATC_TOOL_DEFINITIONS } from '@atc/shared';
import { resolve } from 'node:path';
import type { RunHandlerOptions } from '../run-handler';
import { createAtcAgent } from './agent';
import { createSharedAgentStores } from './stores';

/**
 * Constructs one private ATC agent runtime. Local development uses b4.run's
 * SQLite defaults; hosted execution supplies shared Postgres stores explicitly.
 */
export async function createAgentRuntime(options: {
  readonly appRoot: string;
  readonly run: RunHandlerOptions;
  readonly env: NodeJS.ProcessEnv;
  readonly now?: () => number;
}) {
  const descriptor = createAtcAgent(options.run);
  const hosted = options.env['VERCEL'] === '1';
  const databaseUrl = options.env['ATC_B4RUN_DATABASE_URL'];
  if (hosted && !databaseUrl)
    throw new Error(
      'ATC_B4RUN_DATABASE_URL is required for hosted b4.run chat',
    );
  const stores = databaseUrl
    ? await createSharedAgentStores(databaseUrl)
    : undefined;
  try {
    const runtime = await createRuntimeFetchHandler({
      appRoot: options.appRoot,
      modules: {
        routes: [
          buildStaticRouteModule({
            kind: 'agent',
            routeId: '/atc',
            routeFile: resolve(options.appRoot, 'src/app/atc/index.ts'),
            routePath: 'src/app/atc/index.ts',
            routeModule: { default: descriptor },
            tools: [],
          }),
        ],
      },
      config: {
        server: {
          agui: {
            clientTools: ['/atc'],
            clientForwardedProps: { '/atc': ['responseSchema'] },
            clientToolTtlMs: 600_000,
            clientToolRetentionMs: THREAD_LIFETIME_MS,
            ...(stores ? { clientToolStore: stores.clientTools } : {}),
          },
        },
      },
      ...(stores
        ? { checkpointer: stores.checkpointer, threadsStore: stores.threads }
        : {}),
      permissionsStore: {
        mode: 'non-interactive',
        load: async () => undefined,
        match: (tool, name) =>
          tool === 'clientTool' && Object.hasOwn(ATC_TOOL_DEFINITIONS, name)
            ? 'allow'
            : 'deny',
        addAllow: async () => {
          throw new Error('ATC exposes browser tools only');
        },
      },
      auth,
      threadAccess: createAtcThreadPolicy(options.now),
      drainDeadlineMs: 1_000,
    });
    return {
      fetch: runtime.fetch,
      close: async () => {
        await runtime.close();
        await stores?.close();
      },
    };
  } catch (error) {
    await stores?.close();
    throw error;
  }
}
