import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { validateGrowthDatabaseEnvironment } from './growth-database-preflight.mts';

import {
  CONTACT_HARD_STOP_REASONS,
  createDatabaseExecutor,
  parseEmailHmacKeyring,
  deleteContact,
  findContactIdByEmail,
  readContactControlState,
  reauthorizeContact,
  stopContact,
  type ContactControlState,
  type ContactHardStopReason,
  type DeleteContactInput,
  type DeleteContactResult,
  type ReauthorizeContactInput,
  type ReauthorizeContactResult,
  type SqlExecutor,
  type EmailHmacKeyring,
  type StopContactInput,
  type StopContactResult,
} from '../src/index.ts';

type GrowthControlCommand = 'approve' | 'delete' | 'status' | 'stop';
type ReauthorizableStop = Exclude<ContactHardStopReason, 'deletion'>;

/** Canonical contact operations exposed to the operator command runner. */
export interface GrowthControlOperations {
  findContactIdByEmail(email: string): Promise<string | null>;
  readStatus(contactId: string): Promise<ContactControlState>;
  approve(input: ReauthorizeContactInput): Promise<ReauthorizeContactResult>;
  stop(input: StopContactInput): Promise<StopContactResult>;
  delete(input: DeleteContactInput): Promise<DeleteContactResult>;
}

/** Injected command collaborators, clocks, and output sinks. */
export interface GrowthControlRunnerDependencies {
  operations: GrowthControlOperations;
  now(): Date;
  createEventId(): string;
  writeOutput(line: string): void;
  writeError(line: string): void;
}

interface ParsedArguments {
  command: GrowthControlCommand;
  email: string;
  allowedPriorStops: ReauthorizableStop[];
}

class GrowthControlUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GrowthControlUsageError';
  }
}

const USAGE =
  'Usage: npx nx control growth -- status|approve|stop|delete --email <address> [--allow-prior-stop <kind>]';

function parseArguments(argv: readonly string[]): ParsedArguments {
  const command = argv[0];
  if (
    command !== 'status' &&
    command !== 'approve' &&
    command !== 'stop' &&
    command !== 'delete'
  ) {
    throw new GrowthControlUsageError(USAGE);
  }

  let email: string | undefined;
  const allowedPriorStops: ReauthorizableStop[] = [];
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (argument === '--email') {
      if (!value || value.startsWith('--') || email !== undefined) {
        throw new GrowthControlUsageError(
          '--email requires exactly one address',
        );
      }
      email = value;
      index += 1;
      continue;
    }
    if (argument === '--allow-prior-stop') {
      if (command !== 'approve' || !value || value.startsWith('--')) {
        throw new GrowthControlUsageError(
          '--allow-prior-stop is valid only for approve and requires a stop kind',
        );
      }
      if (
        value === 'deletion' ||
        !(CONTACT_HARD_STOP_REASONS as readonly string[]).includes(value)
      ) {
        throw new GrowthControlUsageError(
          `--allow-prior-stop is not permitted for ${value}`,
        );
      }
      allowedPriorStops.push(value as ReauthorizableStop);
      index += 1;
      continue;
    }
    throw new GrowthControlUsageError(`Unexpected argument. ${USAGE}`);
  }
  if (!email) {
    throw new GrowthControlUsageError('--email is required');
  }
  return {
    command,
    email,
    allowedPriorStops: [...new Set(allowedPriorStops)],
  };
}

function safeStatusOutput(state: ContactControlState): Record<string, unknown> {
  return {
    contactId: state.contactId,
    authorization: state.authorization,
    canSend: state.canSend,
    deleted: state.deletedAt !== null,
    latestStop: state.latestHardStop,
  };
}

/** Binds operator commands to canonical contact privacy and stop boundaries. */
export function createGrowthControlOperations(
  executor: SqlExecutor,
  keyring: EmailHmacKeyring,
): GrowthControlOperations {
  return {
    findContactIdByEmail: (email) =>
      findContactIdByEmail(executor, email, keyring),
    readStatus: (contactId) => readContactControlState(executor, contactId),
    approve: (input) => reauthorizeContact(executor, input),
    stop: (input) => stopContact(executor, input),
    delete: (input) => deleteContact(executor, input),
  };
}

/** Runs one validated operator command, returning its process exit status. */
export async function runGrowthControl(
  argv: readonly string[],
  dependencies: GrowthControlRunnerDependencies,
): Promise<number> {
  try {
    const parsed = parseArguments(argv);
    const contactId = await dependencies.operations.findContactIdByEmail(
      parsed.email,
    );
    if (!contactId) throw new Error('Growth contact not found');

    if (parsed.command === 'status') {
      const status = await dependencies.operations.readStatus(contactId);
      dependencies.writeOutput(
        JSON.stringify({ command: 'status', ...safeStatusOutput(status) }),
      );
      return 0;
    }

    const occurredAt = dependencies.now();
    const eventId = dependencies.createEventId();
    if (parsed.command === 'approve') {
      const result = await dependencies.operations.approve({
        contactId,
        eventKey: `founder-cli:approve:${eventId}`,
        occurredAt,
        actor: 'founder',
        reason: 'founder_explicit_reauthorization',
        source: 'founder_cli',
        policyVersion: 'growth-v1',
        allowedPriorStops: parsed.allowedPriorStops,
      });
      dependencies.writeOutput(
        JSON.stringify({
          command: 'approve',
          contactId,
          reauthorized: result.reauthorized,
          blockedBy: result.blockedBy,
          authorization: result.state.authorization,
        }),
      );
      return result.reauthorized || result.state.canSend ? 0 : 1;
    }

    if (parsed.command === 'stop') {
      const result = await dependencies.operations.stop({
        contactId,
        reason: 'manual_suppression',
        eventKey: `founder-cli:stop:${eventId}`,
        occurredAt,
        source: 'founder_cli',
        provenance: {
          actor: 'founder',
          kind: 'founder_action',
          policyVersion: 'growth-v1',
        },
      });
      dependencies.writeOutput(
        JSON.stringify({
          command: 'stop',
          contactId,
          applied: result.applied,
          effective: result.effective,
          providerSync: result.providerSync,
          cancelledJobCount: result.cancelledJobIds.length,
          legacyProviderCancellationIds: result.legacyProviderCancellationIds,
          preservedJobCount: result.preservedJobIds.length,
          race: result.race,
        }),
      );
      return 0;
    }

    const result = await dependencies.operations.delete({
      contactId,
      eventKey: `founder-cli:delete:${eventId}`,
      occurredAt,
      actor: 'founder',
      source: 'founder_cli',
      policyVersion: 'growth-v1',
    });
    dependencies.writeOutput(
      JSON.stringify({
        command: 'delete',
        contactId,
        deleted: result.deleted,
        cancelledJobCount: result.cancelledJobIds.length,
        retainedJobCount: result.retainedJobIds.length,
        deletedArtifactCount: result.deletedArtifactIds.length,
        unlinkedProjectCount: result.unlinkedProjectIds.length,
      }),
    );
    return 0;
  } catch (error) {
    dependencies.writeError(
      error instanceof GrowthControlUsageError
        ? error.message
        : 'Growth operation failed',
    );
    return error instanceof GrowthControlUsageError ? 2 : 1;
  }
}

interface GrowthControlMainDependencies {
  createExecutor(): SqlExecutor;
  loadKeyring(): EmailHmacKeyring;
  createOperations(
    executor: SqlExecutor,
    keyring: EmailHmacKeyring,
  ): GrowthControlOperations;
  now(): Date;
  createEventId(): string;
  writeOutput(line: string): void;
  writeError(line: string): void;
}

/** Loads the canonical Hashbrown email HMAC keyring for operator lookups. */
export const parseEmailHmacKeyringEnvironment = parseEmailHmacKeyring;

const DEFAULT_MAIN_DEPENDENCIES: GrowthControlMainDependencies = {
  createExecutor: () => {
    validateGrowthDatabaseEnvironment({
      mode: 'migration',
      environment: process.env,
      nodeVersion: process.versions.node,
    });
    return createDatabaseExecutor();
  },
  loadKeyring: () => parseEmailHmacKeyringEnvironment(process.env),
  createOperations: createGrowthControlOperations,
  now: () => new Date(),
  createEventId: randomUUID,
  writeOutput: (line) => process.stdout.write(`${line}\n`),
  writeError: (line) => process.stderr.write(`${line}\n`),
};

/** Validates command and credentials before creating and closing its database. */
export async function mainGrowthControl(
  argv: readonly string[] = process.argv.slice(2),
  dependencies: GrowthControlMainDependencies = DEFAULT_MAIN_DEPENDENCIES,
): Promise<number> {
  try {
    parseArguments(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : USAGE;
    dependencies.writeError(message);
    return error instanceof GrowthControlUsageError ? 2 : 1;
  }
  let keyring: EmailHmacKeyring;
  try {
    keyring = dependencies.loadKeyring();
  } catch (error) {
    dependencies.writeError(
      error instanceof Error ? error.message : 'Invalid email HMAC keyring',
    );
    return 1;
  }
  const executor = dependencies.createExecutor();
  try {
    return await runGrowthControl(argv, {
      operations: dependencies.createOperations(executor, keyring),
      now: dependencies.now,
      createEventId: dependencies.createEventId,
      writeOutput: dependencies.writeOutput,
      writeError: dependencies.writeError,
    });
  } finally {
    await executor.close?.();
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  void mainGrowthControl().then(
    (exitCode) => {
      process.exitCode = exitCode;
    },
    () => {
      process.stderr.write('Growth operation failed\n');
      process.exitCode = 1;
    },
  );
}
