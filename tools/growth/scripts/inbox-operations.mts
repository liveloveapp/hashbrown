import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { createDatabaseExecutor } from '../src/lib/database.ts';
import { loadInboxPilot } from '../src/lib/inbox-replies.ts';
import { createInboxRuntime } from '../src/lib/inbox-runtime.ts';
import { recoverInbox } from '../src/lib/inbox-recovery.ts';
import {
  readInboxHealth,
  reviewInboxReceipt,
} from '../src/lib/receiving-operations.ts';
import { validateGrowthDatabaseEnvironment } from './growth-database-preflight.mts';

/** Injectable operator operations; status never requires provider credentials. */
export interface InboxOperationsDependencies {
  status(): Promise<{ healthy: boolean; codes: string[] }>;
  recover(): Promise<{
    complete: boolean;
    received: number;
    processed: number;
  }>;
  review(input: {
    receiptId: string;
    actor: string;
    evidence: string;
  }): Promise<void>;
  writeOutput(line: string): void;
  writeError(line: string): void;
}

/** Runs receiving commands with redacted failures and explicit per-receipt review. */
export async function runInboxOperations(
  argv: string[],
  deps: InboxOperationsDependencies,
): Promise<number> {
  let command: string;
  let review:
    { receiptId: string; actor: string; evidence: string } | undefined;
  try {
    const flags = argv.filter((value) => value.startsWith('--'));
    if (new Set(flags.map((flag) => flag.split('=')[0])).size !== flags.length)
      throw new Error('usage');
    const { positionals, values } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        actor: { type: 'string' },
        evidence: { type: 'string' },
        'receipt-id': { type: 'string' },
      },
    });
    command = positionals[0];
    if (
      positionals.length !== 1 ||
      !['status', 'health', 'recover', 'review-ignore'].includes(command)
    )
      throw new Error('usage');
    if (command === 'review-ignore') {
      const receiptId = values['receipt-id'] ?? '';
      const actor = values.actor ?? '';
      const evidence = values.evidence ?? '';
      const fields = [receiptId, actor, evidence];
      if (
        fields.some(
          (value) =>
            typeof value !== 'string' ||
            !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value),
        )
      )
        throw new Error('usage');
      review = { receiptId, actor, evidence };
    } else if (Object.keys(values).length) throw new Error('usage');
  } catch {
    deps.writeError(
      'Usage: npx nx inbox growth -- status|health|recover|review-ignore [--receipt-id ID --actor ACTOR --evidence REF]',
    );
    return 2;
  }
  try {
    if (command === 'status' || command === 'health') {
      const result = await deps.status();
      deps.writeOutput(JSON.stringify(result));
      return command === 'health' && !result.healthy ? 1 : 0;
    }
    if (command === 'recover') {
      const result = await deps.recover();
      deps.writeOutput(JSON.stringify(result));
      return result.complete ? 0 : 1;
    }
    if (!review) throw new Error('Missing review evidence');
    await deps.review(review);
    deps.writeOutput(
      JSON.stringify({ applied: true, operation: 'review-ignore' }),
    );
    return 0;
  } catch {
    deps.writeError('Inbox operation failed; campaigns remain blocked.');
    return 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const writeError = (line: string) => process.stderr.write(`${line}\n`);
  const main = async () => {
    validateGrowthDatabaseEnvironment({
      mode: 'migration',
      environment: process.env,
      nodeVersion: process.versions.node,
    });
    const config = loadInboxPilot();
    if (!config.enabled) throw new Error('Inbox disabled');
    const db = createDatabaseExecutor();
    try {
      return await runInboxOperations(process.argv.slice(2), {
        status: () => readInboxHealth(db, new Date()),
        recover: () => recoverInbox(db, config, createInboxRuntime()),
        review: (input) =>
          reviewInboxReceipt(db, { ...input, occurredAt: new Date() }),
        writeOutput: (line) => process.stdout.write(`${line}\n`),
        writeError,
      });
    } finally {
      await db.close?.();
    }
  };
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch(() => {
      writeError('Inbox operation failed; campaigns remain blocked.');
      process.exitCode = 1;
    });
}
