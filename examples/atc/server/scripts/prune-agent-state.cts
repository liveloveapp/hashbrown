import { resolveCheckpointer, resolveThreadsStore } from '@b4run/cli/runtime';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pruneAnonymousThreads } from '../src/b4run/cleanup';
import { createSharedAgentStores } from '../src/b4run/stores';
import { THREAD_LIFETIME_MS } from '../src/b4run/thread-policy';

async function main(): Promise<void> {
  if (!process.argv.includes('--offline'))
    throw new Error(
      'Stop every ATC agent instance before running cleanup, then pass --offline',
    );
  const appRoot = resolve('examples/atc/server');
  const databaseUrl = process.env['ATC_B4RUN_DATABASE_URL'];
  const shared = databaseUrl
    ? await createSharedAgentStores(databaseUrl)
    : undefined;
  const threads = shared?.threads ?? (await resolveThreadsStore(appRoot));
  const checkpointer =
    shared?.checkpointer ?? (await resolveCheckpointer(appRoot));
  try {
    const count = await pruneAnonymousThreads({
      threads,
      checkpointer,
      now: Date.now(),
    });
    if (shared) {
      await shared.clientTools.prune({
        before: new Date(Date.now() - THREAD_LIFETIME_MS).toISOString(),
      });
    } else {
      const result = spawnSync(
        process.execPath,
        [
          resolve(appRoot, '../../../node_modules/@b4run/cli/bin/b4.js'),
          'client-tools',
          'prune',
          '--retention',
          String(THREAD_LIFETIME_MS),
          '--cwd',
          appRoot,
        ],
        {
          stdio: 'inherit',
          env: {
            ...process.env,
            TSX_TSCONFIG_PATH: resolve(appRoot, 'tsconfig.json'),
          },
        },
      );
      if (result.error) throw result.error;
      if (result.status !== 0)
        throw new Error(
          'Pending-tool cleanup failed; rerun while still offline',
        );
    }
    console.log(`Deleted ${count} expired anonymous thread(s)`);
  } finally {
    await shared?.close();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
