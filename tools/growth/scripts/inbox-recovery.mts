import { pathToFileURL } from 'node:url';

import { createDatabaseExecutor } from '../src/lib/database.ts';
import { loadInboxPilot } from '../src/lib/inbox-replies.ts';
import { createInboxRuntime } from '../src/lib/inbox-runtime.ts';
import { recoverInbox } from '../src/lib/inbox-recovery.ts';
import { validateGrowthDatabaseEnvironment } from './growth-database-preflight.mts';

/** Runs a complete receiving scan with explicit environment and server credentials. */
export async function runInboxRecovery(): Promise<{
  received: number;
  processed: number;
  complete: boolean;
}> {
  const config = loadInboxPilot();
  if (!config.enabled) throw new Error('Inbox pilot is disabled');
  validateGrowthDatabaseEnvironment({
    mode: 'migration',
    environment: process.env,
    nodeVersion: process.versions.node,
  });
  const runtime = createInboxRuntime();
  const db = createDatabaseExecutor();
  try {
    return await recoverInbox(db, config, runtime);
  } finally {
    await db.close?.();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runInboxRecovery()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch(() => {
      // Provider failures must never print bodies, addresses, API keys, or connection strings.
      process.stderr.write(
        'Inbox recovery failed; campaigns remain blocked. Inspect provider health and pending receipt error codes.\n',
      );
      process.exitCode = 1;
    });
}
