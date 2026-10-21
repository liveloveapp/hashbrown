import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createDatabaseExecutor,
  parseEmailHmacKeyring,
  readObservationHealth,
  readTimeline,
  readObservationIdentity,
  processObservations,
  replayObservations,
  redactObservationEvidence,
  initializeObservationRedactions,
  ObservationError,
  type SqlExecutor,
  type EmailHmacKeyring,
  collectionSource,
  readGrowthFunnel,
  readContactJourney,
} from '../src/index.ts';
import { uuid } from '../src/lib/observability/contracts.ts';

/** Side effects the operator commands depend on, injected so tests can fake them. */
export interface ObservabilityOperatorDependencies {
  createDatabase(): SqlExecutor;
  loadKeyring(): EmailHmacKeyring;
  environment(): Readonly<Record<string, string | undefined>>;
  now(): Date;
  readEmail(): Promise<string>;
  writeOutput(value: string): void;
  writeError(value: string): void;
}
const flags: Record<string, readonly string[]> = {
  funnel: ['from', 'to'],
  journey: ['contact'],
  health: ['from', 'to'],
  timeline: ['subject', 'cursor', 'limit'],
  detail: ['observation', 'include-identity'],
  process: ['limit'],
  replay: ['subject', 'source', 'from', 'to', 'operation', 'max-events'],
  redact: ['subject', 'email-stdin', 'operation'],
  'initialize-redactions': ['limit', 'cursor'],
};
function invalid(): never {
  throw new ObservationError('invalid_arguments');
}
function date(value: string | undefined): Date {
  if (!value) invalid();
  const result = new Date(value);
  if (!Number.isFinite(result.getTime())) invalid();
  return result;
}
function count(
  value: string | undefined,
  maximum: number,
  fallback?: number,
): number {
  if (value === undefined && fallback !== undefined) return fallback;
  if (!value || !/^\d+$/u.test(value)) invalid();
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > maximum) invalid();
  return n;
}
function parseArguments(argv: readonly string[]) {
  const command = argv[0];
  if (!command || !Object.hasOwn(flags, command)) invalid();
  const args: Record<string, string> = {};
  for (let i = 1; i < argv.length; i++) {
    const key = argv[i].slice(2);
    if (
      !argv[i].startsWith('--') ||
      !flags[command].includes(key) ||
      Object.hasOwn(args, key)
    )
      invalid();
    if (key === 'include-identity' || key === 'email-stdin') {
      args[key] = 'true';
      continue;
    }
    const value = argv[++i];
    if (!value || value.startsWith('--')) invalid();
    args[key] = value;
  }
  if (command === 'health' || command === 'funnel') {
    const from = date(args.from),
      to = date(args.to);
    if (to <= from || to.getTime() - from.getTime() > 31 * 86400000) invalid();
  }
  if (command === 'journey') uuid(args.contact);
  if (command === 'timeline') {
    uuid(args.subject);
    count(args.limit, 100, 100);
    if (args.cursor && args.cursor.length > 300) invalid();
  }
  if (command === 'detail') {
    uuid(args.observation);
    if (args['include-identity'] !== 'true') invalid();
  }
  if (command === 'process') count(args.limit, 100);
  if (command === 'initialize-redactions') {
    count(args.limit, 100);
    if (args.cursor) uuid(args.cursor);
  }
  if (command === 'redact') {
    uuid(args.operation);
    if (Boolean(args.subject) === Boolean(args['email-stdin'])) invalid();
    if (args.subject) uuid(args.subject);
  }
  if (command === 'replay') {
    uuid(args.operation);
    count(args['max-events'], 1000);
    if (args.subject) {
      uuid(args.subject);
      if (args.source || args.from || args.to) invalid();
    } else {
      collectionSource(args.source);
      const from = date(args.from),
        to = date(args.to);
      if (to <= from || to.getTime() - from.getTime() > 86400000) invalid();
    }
  }
  return { command, args };
}
/**
 * Runs one growth observability command and writes one JSON line to stdout.
 * Errors write only an {@link ObservationError} code or `operation_failed`.
 *
 * @param argv - The command followed by its flags.
 * @param deps - The injected side effects.
 * @returns 0 on success, 1 on an operation failure, 2 on invalid arguments.
 */
export async function runGrowthObservability(
  argv: readonly string[],
  deps: ObservabilityOperatorDependencies,
): Promise<number> {
  let parsed: ReturnType<typeof parseArguments>;
  try {
    parsed = parseArguments(argv);
  } catch {
    deps.writeError('invalid_arguments');
    return 2;
  }
  const { command, args } = parsed;
  let db: SqlExecutor | undefined;
  try {
    if (
      command === 'process' &&
      deps.environment()['GROWTH_OBSERVATION_PROCESSING_ENABLED'] !== 'true'
    ) {
      deps.writeOutput(JSON.stringify({ command, disabled: true }));
      return 0;
    }
    let email: string | undefined;
    if (args['email-stdin']) {
      email = (await deps.readEmail()).trim();
      if (!email || email.length > 320 || /[\r\n]/u.test(email)) invalid();
    }
    db = deps.createDatabase();
    let result: unknown;
    switch (command) {
      case 'funnel':
        result = await readGrowthFunnel(db, {
          from: date(args.from),
          to: date(args.to),
        });
        break;
      case 'journey':
        result = await readContactJourney(db, args.contact);
        break;
      case 'health':
        result = await readObservationHealth(db, {
          from: date(args.from),
          to: date(args.to),
        });
        break;
      case 'timeline':
        result = await readTimeline(db, args.subject, {
          limit: count(args.limit, 100, 100),
          cursor: args.cursor,
        });
        break;
      case 'detail':
        result = await readObservationIdentity(db, args.observation);
        break;
      case 'process':
        result = await processObservations(db, {
          enabled: true,
          limit: count(args.limit, 100),
          now: deps.now,
        });
        break;
      case 'replay':
        result = await replayObservations(
          db,
          {
            operationId: args.operation,
            maxEvents: count(args['max-events'], 1000),
            ...(args.subject
              ? { subjectId: args.subject }
              : {
                  source: collectionSource(args.source),
                  from: date(args.from),
                  to: date(args.to),
                }),
          },
          deps.now(),
        );
        break;
      case 'redact':
        result = await redactObservationEvidence(
          db,
          args.subject ? { subjectId: args.subject } : { email: email ?? invalid() },
          {
            operationId: args.operation,
            now: deps.now(),
            keyring: deps.loadKeyring(),
          },
        );
        break;
      case 'initialize-redactions':
        result = await initializeObservationRedactions(
          db,
          { limit: count(args.limit, 100), cursor: args.cursor },
          deps.now(),
        );
        break;
    }
    deps.writeOutput(JSON.stringify({ command, result }));
    return 0;
  } catch (error) {
    deps.writeError(
      error instanceof ObservationError ? error.code : 'operation_failed',
    );
    return 1;
  } finally {
    if (db?.close) await db.close().catch(() => undefined);
  }
}
async function readEmail(): Promise<string> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.from(chunk);
    length += bytes.length;
    if (length > 1280) throw new ObservationError('invalid_arguments');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString('utf8');
}
if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  void runGrowthObservability(process.argv.slice(2), {
    createDatabase: () => createDatabaseExecutor(),
    loadKeyring: () => parseEmailHmacKeyring(process.env),
    environment: () => process.env,
    now: () => new Date(),
    readEmail,
    writeOutput: (line) => process.stdout.write(line + '\n'),
    writeError: (line) => process.stderr.write(line + '\n'),
  }).then(
    (code) => {
      process.exitCode = code;
    },
    () => {
      process.stderr.write('operation_failed\n');
      process.exitCode = 1;
    },
  );
}
