import { expect, test, vi } from 'vitest';

import { recoverInbox } from './inbox-recovery.ts';
import { executorWith } from './testing/fake-executor.ts';

const config = {
  enabled: true as const,
  address: 'brian@replies.hashbrown.dev',
  startedAt: new Date('2026-10-22T00:00:00Z'),
};
const now = new Date('2026-10-22T01:00:00Z');

function setup(overrides: Parameters<typeof executorWith>[0] = {}) {
  return executorWith({
    'inbox-ensure-mailbox': () => ({ rows: [{ address: config.address }] }),
    'inbox-recovery-start': () => ({ rows: [{ healthy_through: null }] }),
    'inbox-unbound': () => ({ rows: [] }),
    'inbox-list-pending': () => ({ rows: [] }),
    'inbox-recovery-complete': () => ({ rows: [{ address: config.address }] }),
    'inbox-list-unforwarded': () => ({ rows: [] }),
    ...overrides,
  });
}

test('failed enumeration never publishes a healthy checkpoint', async () => {
  const { executor, calls } = setup();
  const listReceived = async function* () {
    throw new Error('network');
    yield { id: 'unreachable', to: [], created_at: '' };
  };

  await expect(
    recoverInbox(executor, config, {
      listReceived,
      getSent: vi.fn(),
      getReceived: vi.fn(),
      stopContact: vi.fn(),
      now: () => now,
    }),
  ).rejects.toThrow('network');
  expect(calls.some((call) => call.marker === 'inbox-recovery-complete')).toBe(
    false,
  );
});

test('checkpoint uses scan start and compare-and-set generation after all work', async () => {
  const { executor, calls } = setup();

  await recoverInbox(executor, config, {
    listReceived: async function* () {
      yield* [];
    },
    getSent: vi.fn(),
    getReceived: vi.fn(),
    stopContact: vi.fn(),
    now: () => now,
  });

  const checkpoint = calls.find(
    (call) => call.marker === 'inbox-recovery-complete',
  );
  expect(checkpoint?.params).toContain(now);
  expect(checkpoint?.sql).toContain('recovery_id = $2::uuid');
  expect(checkpoint?.sql).toContain('reference_ids is null');
});

test('a gap beyond provider retention cannot be declared recovered', async () => {
  const { executor, calls } = setup();

  await expect(
    recoverInbox(executor, config, {
      listReceived: async function* () {
        yield* [];
      },
      getSent: vi.fn(),
      getReceived: vi.fn(),
      stopContact: vi.fn(),
      now: () => new Date('2026-11-23T00:00:00Z'),
    }),
  ).rejects.toThrow('retention');
  expect(calls.some((call) => call.marker === 'inbox-recovery-complete')).toBe(
    false,
  );
});

test('recovery forwards completed and ignored receipts independently of pending replies', async () => {
  const { executor, calls } = setup({
    'inbox-list-unforwarded': () => ({
      rows: [{ id: 'stopped-mail' }, { id: 'ignored-mail' }],
    }),
  });
  const forwardReceipt = vi.fn(async () => 'forward-id');

  await recoverInbox(executor, config, {
    listReceived: async function* () {
      yield* [];
    },
    getSent: vi.fn(),
    getReceived: vi.fn(),
    stopContact: vi.fn(),
    now: () => now,
    forwardReceipt,
  });

  expect(forwardReceipt.mock.calls).toEqual([
    [executor, 'stopped-mail'],
    [executor, 'ignored-mail'],
  ]);
  const selection = calls.find(
    (call) => call.marker === 'inbox-list-unforwarded',
  );
  expect(selection?.sql).toContain('forward_provider_id is null');
  expect(selection?.sql).not.toContain("status = 'pending'");
});

test('reply processing failure still forwards all receipts and prevents recovery checkpoint', async () => {
  const { executor, calls } = setup({
    'inbox-list-pending': () => ({ rows: [{ id: 'incoming-1' }] }),
    'inbox-list-unforwarded': () => ({
      rows: [{ id: 'incoming-1' }, { id: 'incoming-2' }],
    }),
  });
  const forwardReceipt = vi.fn(async () => 'forward-id');

  await expect(
    recoverInbox(executor, config, {
      listReceived: async function* () {
        yield* [];
      },
      getSent: vi.fn(),
      getReceived: vi.fn().mockRejectedValue(new Error('read failed')),
      stopContact: vi.fn(),
      now: () => now,
      forwardReceipt,
    }),
  ).rejects.toThrow();

  expect(forwardReceipt).toHaveBeenCalledTimes(2);
  expect(calls.some((call) => call.marker === 'inbox-recovery-complete')).toBe(
    false,
  );
});

test('forward failure continues remaining forwards and prevents recovery checkpoint', async () => {
  const { executor, calls } = setup({
    'inbox-list-unforwarded': () => ({
      rows: [{ id: 'incoming-1' }, { id: 'incoming-2' }],
    }),
  });
  const forwardReceipt = vi
    .fn()
    .mockRejectedValueOnce(new Error('send failed'))
    .mockResolvedValueOnce('forward-id');

  await expect(
    recoverInbox(executor, config, {
      listReceived: async function* () {
        yield* [];
      },
      getSent: vi.fn(),
      getReceived: vi.fn(),
      stopContact: vi.fn(),
      now: () => now,
      forwardReceipt,
    }),
  ).rejects.toThrow();

  expect(forwardReceipt).toHaveBeenCalledTimes(2);
  expect(calls.some((call) => call.marker === 'inbox-recovery-complete')).toBe(
    false,
  );
});
