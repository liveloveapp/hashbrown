import { expect, test, vi } from 'vitest';

import { runGrowthObservability } from './growth-observability.mts';

const SUBJECT = '11111111-1111-4111-8111-111111111111';
const OPERATION = '22222222-2222-4222-8222-222222222222';

function dependencies(environment: Record<string, string | undefined> = {}) {
  return {
    createDatabase: vi.fn(() => {
      throw new Error('must not connect');
    }),
    loadKeyring: vi.fn(() => ({
      active: { version: 1, secret: 'x'.repeat(32) },
    })),
    environment: () => environment,
    now: () => new Date('2026-09-04T12:00:00Z'),
    readEmail: vi.fn(async () => ''),
    writeOutput: vi.fn(),
    writeError: vi.fn(),
  };
}

test('rejects unknown flags and duplicate flags with exit 2', async () => {
  const unknown = dependencies();
  const duplicate = dependencies();

  const unknownCode = await runGrowthObservability(
    ['redact', '--email', 'private@example.invalid'],
    unknown,
  );
  const duplicateCode = await runGrowthObservability(
    ['process', '--limit', '1', '--limit', '2'],
    duplicate,
  );

  expect(unknownCode).toBe(2);
  expect(duplicateCode).toBe(2);
  expect(unknown.createDatabase).not.toHaveBeenCalled();
  expect(duplicate.createDatabase).not.toHaveBeenCalled();
  expect(unknown.writeError).toHaveBeenCalledWith('invalid_arguments');
  expect(JSON.stringify(unknown.writeError.mock.calls)).not.toContain(
    'private@example.invalid',
  );
});

test('process is disabled unless the switch is exactly true', async () => {
  const off = dependencies({ GROWTH_OBSERVATION_PROCESSING_ENABLED: 'yes' });

  const code = await runGrowthObservability(['process', '--limit', '10'], off);

  expect(code).toBe(0);
  expect(off.createDatabase).not.toHaveBeenCalled();
  expect(off.writeOutput).toHaveBeenCalledWith(
    JSON.stringify({ command: 'process', disabled: true }),
  );
});

test('redact reads the email from stdin and never echoes it', async () => {
  const email = 'private@example.invalid';
  const close = vi.fn(async () => undefined);
  const execute = vi.fn(async () => {
    throw new Error(email);
  });
  const deps = {
    ...dependencies(),
    readEmail: vi.fn(async () => `${email}\n`),
    createDatabase: vi.fn(() => ({
      execute,
      close,
      transaction: vi.fn(async () => {
        throw new Error(email);
      }),
    })),
  };

  const code = await runGrowthObservability(
    ['redact', '--email-stdin', '--operation', OPERATION],
    deps,
  );

  expect(deps.readEmail).toHaveBeenCalledOnce();
  expect(code).toBe(1);
  expect(JSON.stringify(deps.writeError.mock.calls)).not.toContain(email);
  expect(JSON.stringify(deps.writeOutput.mock.calls)).not.toContain(email);
});

test('a storage failure prints operation_failed and closes the executor', async () => {
  const close = vi.fn(async () => undefined);
  const execute = vi.fn(async () => {
    throw new Error('postgres://secret');
  });
  const deps = {
    ...dependencies(),
    createDatabase: vi.fn(() => ({ execute, close, transaction: vi.fn() })),
  };

  const code = await runGrowthObservability(
    ['timeline', '--subject', SUBJECT],
    deps,
  );

  expect(code).toBe(1);
  expect(close).toHaveBeenCalledOnce();
  expect(deps.writeError).toHaveBeenCalledWith('operation_failed');
  expect(deps.writeOutput).not.toHaveBeenCalled();
});

test('detail without --include-identity exits 2', async () => {
  const deps = dependencies();

  const code = await runGrowthObservability(
    ['detail', '--observation', SUBJECT],
    deps,
  );

  expect(code).toBe(2);
  expect(deps.createDatabase).not.toHaveBeenCalled();
});

test('funnel rejects a range over 31 days with the error code only', async () => {
  const deps = dependencies();

  const code = await runGrowthObservability(
    ['funnel', '--from', '2026-01-01', '--to', '2026-09-05'],
    deps,
  );

  expect(code).toBe(2);
  expect(deps.createDatabase).not.toHaveBeenCalled();
  expect(deps.writeError.mock.calls).toEqual([['invalid_arguments']]);
});
