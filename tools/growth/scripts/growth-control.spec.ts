import { expect, test, vi } from 'vitest';

import type {
  ContactControlState,
  DeleteContactInput,
  DeleteContactResult,
  EmailHmacKeyring,
  ReauthorizeContactInput,
  ReauthorizeContactResult,
  SqlExecutor,
  StopContactInput,
  StopContactResult,
} from '../src/index.ts';
import {
  createGrowthControlOperations,
  type GrowthControlOperations,
  mainGrowthControl,
  parseEmailHmacKeyringEnvironment,
  runGrowthControl,
} from './growth-control.mts';

const contactId = '00000000-0000-4000-8000-000000000001';
const now = new Date('2026-09-01T12:00:00.000Z');
const keyring: EmailHmacKeyring = {
  active: { version: 2, secret: 'a'.repeat(32) },
  previous: [{ version: 1, secret: 'b'.repeat(32) }],
};

function state(
  overrides: Partial<ContactControlState> = {},
): ContactControlState {
  return {
    contactId,
    authorization: 'unapproved',
    canSend: false,
    outreachApprovedAt: null,
    latestHardStop: null,
    deletedAt: null,
    updatedAt: now,
    ...overrides,
  };
}

function operationsWith(overrides: Partial<GrowthControlOperations> = {}): {
  calls: {
    approve: ReauthorizeContactInput[];
    delete: DeleteContactInput[];
    emails: string[];
    status: string[];
    stop: StopContactInput[];
  };
  operations: GrowthControlOperations;
} {
  const calls = {
    approve: [] as ReauthorizeContactInput[],
    delete: [] as DeleteContactInput[],
    emails: [] as string[],
    status: [] as string[],
    stop: [] as StopContactInput[],
  };
  const operations: GrowthControlOperations = {
    async findContactIdByEmail(email) {
      calls.emails.push(email);
      return contactId;
    },
    async readStatus(id) {
      calls.status.push(id);
      return state();
    },
    async approve(input) {
      calls.approve.push(input);
      return {
        reauthorized: true,
        blockedBy: [],
        state: state({
          authorization: 'approved',
          canSend: true,
          outreachApprovedAt: now,
        }),
      } satisfies ReauthorizeContactResult;
    },
    async stop(input) {
      calls.stop.push(input);
      return {
        applied: true,
        effective: true,
        contactId,
        reason: input.reason,
        providerSync: { action: 'suppress_contact', required: true },
        cancelledJobIds: [],
        legacyProviderCancellationIds: [],
        preservedJobIds: [],
        race: {
          boundedProviderSubmissionPossible: false,
          manualReviewRequired: false,
          jobIds: [],
          providerSubmissionAlreadyRecordedJobIds: [],
          unknownDeliveryJobIds: [],
        },
      } satisfies StopContactResult;
    },
    async delete(input) {
      calls.delete.push(input);
      return {
        deleted: true,
        state: state({ authorization: 'deleted', deletedAt: now }),
        cancelledJobIds: [],
        retainedJobIds: [],
        unlinkedProjectIds: [],
        deletedArtifactIds: [],
      } satisfies DeleteContactResult;
    },
    ...overrides,
  };
  return { calls, operations };
}

function runnerHarness(operations: GrowthControlOperations) {
  const output: string[] = [];
  const errors: string[] = [];
  return {
    errors,
    output,
    dependencies: {
      operations,
      now: () => now,
      createEventId: () => 'event-uuid-1',
      writeOutput: (line: string) => output.push(line),
      writeError: (line: string) => errors.push(line),
    },
  };
}

test('prints structured status without redisclosing the email', async () => {
  const { calls, operations } = operationsWith();
  const harness = runnerHarness(operations);

  const exitCode = await runGrowthControl(
    ['status', '--email', ' Person@Example.COM '],
    harness.dependencies,
  );

  expect(exitCode).toBe(0);
  expect(calls.emails).toEqual([' Person@Example.COM ']);
  expect(calls.status).toEqual([contactId]);
  expect(harness.output).toHaveLength(1);
  expect(harness.output[0]).not.toContain('Person@Example.COM');
  expect(JSON.parse(String(harness.output[0]))).toEqual({
    command: 'status',
    contactId,
    authorization: 'unapproved',
    canSend: false,
    deleted: false,
    latestStop: null,
  });
});

test('uses dedicated founder reauthorization with safe default prior-stop policy', async () => {
  const { calls, operations } = operationsWith();
  const harness = runnerHarness(operations);

  const exitCode = await runGrowthControl(
    ['approve', '--email', 'person@example.com'],
    harness.dependencies,
  );

  expect(exitCode).toBe(0);
  expect(calls.approve).toEqual([
    {
      contactId,
      eventKey: 'founder-cli:approve:event-uuid-1',
      occurredAt: now,
      actor: 'founder',
      reason: 'founder_explicit_reauthorization',
      source: 'founder_cli',
      policyVersion: 'growth-v1',
      allowedPriorStops: [],
    },
  ]);
});

test('allows only explicitly named prior stops for approval', async () => {
  const { calls, operations } = operationsWith();
  const harness = runnerHarness(operations);

  const exitCode = await runGrowthControl(
    [
      'approve',
      '--email',
      'person@example.com',
      '--allow-prior-stop',
      'campaign.reply_received',
    ],
    harness.dependencies,
  );

  expect(exitCode).toBe(0);
  expect(calls.approve[0]?.allowedPriorStops).toEqual([
    'campaign.reply_received',
  ]);
});

test('routes founder stop through canonical manual suppression without a provider call', async () => {
  const { calls, operations } = operationsWith();
  const harness = runnerHarness(operations);

  const exitCode = await runGrowthControl(
    ['stop', '--email', 'person@example.com'],
    harness.dependencies,
  );

  expect(exitCode).toBe(0);
  expect(calls.stop).toEqual([
    {
      contactId,
      reason: 'manual_suppression',
      eventKey: 'founder-cli:stop:event-uuid-1',
      occurredAt: now,
      source: 'founder_cli',
      provenance: {
        actor: 'founder',
        kind: 'founder_action',
        policyVersion: 'growth-v1',
      },
    },
  ]);
  expect(JSON.parse(String(harness.output[0]))).toMatchObject({
    command: 'stop',
    providerSync: { action: 'suppress_contact', required: true },
  });
});

test('routes delete through the Task 2 deletion command', async () => {
  const { calls, operations } = operationsWith();
  const harness = runnerHarness(operations);

  const exitCode = await runGrowthControl(
    ['delete', '--email', 'person@example.com'],
    harness.dependencies,
  );

  expect(exitCode).toBe(0);
  expect(calls.delete).toEqual([
    {
      contactId,
      eventKey: 'founder-cli:delete:event-uuid-1',
      occurredAt: now,
      actor: 'founder',
      source: 'founder_cli',
      policyVersion: 'growth-v1',
    },
  ]);
});

for (const [index, [argv, message]] of (
  [
    [[], /usage/iu],
    [['unknown', '--email', 'person@example.com'], /usage/iu],
    [['status'], /--email/u],
    [
      [
        'approve',
        '--email',
        'person@example.com',
        '--allow-prior-stop',
        'deletion',
      ],
      /allow-prior-stop/u,
    ],
  ] as const
).entries()) {
  test(`returns a clear usage error for invalid arguments ${index}`, async () => {
    const { operations } = operationsWith();
    const harness = runnerHarness(operations);

    const exitCode = await runGrowthControl([...argv], harness.dependencies);

    expect(exitCode).toBe(2);
    expect(harness.errors.join('\n')).toMatch(message);
    expect(harness.output).toEqual([]);
  });
}

test('uses current and rotation-alias HMACs and returns deleted tombstones by opaque id', async () => {
  const calls: { parameters: readonly unknown[]; sql: string }[] = [];
  const executor: SqlExecutor = {
    async execute<Row extends Record<string, unknown>>(
      sql: string,
      parameters: readonly unknown[] = [],
    ) {
      calls.push({ parameters, sql });
      return { rows: [{ id: contactId }] as unknown as Row[] };
    },
    async transaction(operation) {
      return operation(this);
    },
  };

  const operations = createGrowthControlOperations(executor, keyring);
  await expect(
    operations.findContactIdByEmail(' Person@Example.COM '),
  ).resolves.toBe(contactId);
  const candidates = JSON.parse(String(calls[0]?.parameters[0]));
  expect(candidates).toHaveLength(2);
  expect(
    candidates.map(
      (candidate: { key_version: number }) => candidate.key_version,
    ),
  ).toEqual([2, 1]);
  expect(calls[0]?.sql).toMatch(/contact\.lookup_alias_added/u);
  expect(calls[0]?.sql).toMatch(/email_lookup_hmac/u);
  expect(calls[0]?.sql).not.toMatch(/email_normalized/u);
  expect(calls[0]?.sql).not.toMatch(/deleted_at/u);
});

test('parses a versioned active key and previous rotation keys', () => {
  expect(
    parseEmailHmacKeyringEnvironment({
      GROWTH_EMAIL_HMAC_ACTIVE_VERSION: '2',
      GROWTH_EMAIL_HMAC_ACTIVE_SECRET: 'a'.repeat(32),
      GROWTH_EMAIL_HMAC_PREVIOUS_KEYS: JSON.stringify([
        { version: 1, secret: 'b'.repeat(32) },
      ]),
    }),
  ).toEqual(keyring);
});

for (const [index, [environment, expected]] of (
  [
    [{}, /active secret/iu],
    [
      {
        GROWTH_EMAIL_HMAC_ACTIVE_VERSION: '1',
        GROWTH_EMAIL_HMAC_ACTIVE_SECRET: 'short',
      },
      /active secret/iu,
    ],
    [
      {
        GROWTH_EMAIL_HMAC_ACTIVE_VERSION: '1',
        GROWTH_EMAIL_HMAC_ACTIVE_SECRET: 'a'.repeat(32),
        GROWTH_EMAIL_HMAC_PREVIOUS_KEYS: JSON.stringify([
          { version: 1, secret: 'b'.repeat(32) },
        ]),
      },
      /unique/iu,
    ],
  ] as const
).entries()) {
  test(`rejects an invalid keyring ${index}`, () => {
    expect(() => parseEmailHmacKeyringEnvironment(environment)).toThrow(
      expected,
    );
  });
}

test('rejects invalid arguments before creating a database executor', async () => {
  const createExecutor = vi.fn();
  const loadKeyring = vi.fn();
  const errors: string[] = [];

  const exitCode = await mainGrowthControl([], {
    createExecutor,
    loadKeyring,
    createOperations: vi.fn(),
    now: () => now,
    createEventId: () => 'event-uuid-1',
    writeOutput: vi.fn(),
    writeError: (line) => errors.push(line),
  });

  expect(exitCode).toBe(2);
  expect(createExecutor).not.toHaveBeenCalled();
  expect(loadKeyring).not.toHaveBeenCalled();
  expect(errors.join('\n')).toMatch(/usage/iu);
});

test('validates the production keyring after valid args and before creating an executor', async () => {
  const createExecutor = vi.fn();
  const loadKeyring = vi.fn(() => {
    throw new Error('Email HMAC active version is required');
  });
  const errors: string[] = [];

  const exitCode = await mainGrowthControl(
    ['status', '--email', 'person@example.com'],
    {
      createExecutor,
      loadKeyring,
      createOperations: vi.fn(),
      now: () => now,
      createEventId: () => 'event-uuid-1',
      writeOutput: vi.fn(),
      writeError: (line) => errors.push(line),
    },
  );

  expect(exitCode).toBe(1);
  expect(loadKeyring).toHaveBeenCalledTimes(1);
  expect(createExecutor).not.toHaveBeenCalled();
  expect(errors.join('\n')).toMatch(/active version/iu);
});

test('creates and closes the database executor only when explicitly run', async () => {
  const { operations } = operationsWith();
  const close = vi.fn(async () => undefined);
  const createExecutor = vi.fn(
    () =>
      ({
        execute: vi.fn(),
        transaction: vi.fn(),
        close,
      }) as unknown as SqlExecutor,
  );
  const createOperations = vi.fn(() => operations);
  const output: string[] = [];

  const exitCode = await mainGrowthControl(
    ['status', '--email', 'person@example.com'],
    {
      createExecutor,
      loadKeyring: () => keyring,
      createOperations,
      now: () => now,
      createEventId: () => 'event-uuid-1',
      writeOutput: (line) => output.push(line),
      writeError: vi.fn(),
    },
  );

  expect(exitCode).toBe(0);
  expect(createExecutor).toHaveBeenCalledTimes(1);
  expect(createOperations).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
  expect(output).toHaveLength(1);
});
