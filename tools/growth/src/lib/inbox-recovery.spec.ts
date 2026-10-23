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
    'inbox-recovery-start': () => ({
      rows: [
        {
          healthy_through: null,
          scan_cursor: null,
          scan_started_at: now,
          scan_complete: false,
          scan_head_id: null,
          covered_head_id: null,
        },
      ],
    }),
    'inbox-recovery-generation-lock': () => ({
      rows: [{ address: config.address }],
    }),
    'inbox-scan-progress': () => ({ rows: [{ address: config.address }] }),
    'inbox-forward-attempt': () => ({ rows: [] }),
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
  expect(checkpoint?.params[2]).toEqual(now);
  expect(checkpoint?.sql).toContain('recovery_id = $2::uuid');
  expect(checkpoint?.sql).toContain(
    'reference_ids is null or contact_id is null',
  );
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

test('bounded scans persist a cursor and resume without declaring coverage', async () => {
  const { executor, calls } = setup();
  const dependencies = {
    listReceived: async function* () {
      for (let index = 0; index < 105; index++)
        yield {
          id: `foreign-${index}`,
          to: ['other@example.com'],
          created_at: now.toISOString(),
        };
    },
    getSent: vi.fn(),
    getReceived: vi.fn(),
    stopContact: vi.fn(),
    now: () => now,
  };

  const result = await recoverInbox(executor, config, dependencies);

  expect(result).toEqual({ received: 0, processed: 0, complete: false });
  expect(
    calls.filter((call) => call.marker === 'inbox-scan-progress'),
  ).toHaveLength(100);
  expect(calls.some((call) => call.marker === 'inbox-recovery-complete')).toBe(
    false,
  );
});

test('restart uses persisted cursor and original scan start for coverage', async () => {
  const scanStarted = new Date('2026-10-22T00:30:00Z');
  const { executor, calls } = setup({
    'inbox-recovery-start': () => ({
      rows: [
        {
          healthy_through: null,
          scan_cursor: 'saved',
          scan_started_at: scanStarted,
          scan_complete: false,
          covered_head_id: null,
        },
      ],
    }),
  });
  const listReceived = vi.fn(async function* () {
    yield* [];
  });

  const result = await recoverInbox(executor, config, {
    listReceived,
    getSent: vi.fn(),
    getReceived: vi.fn(),
    stopContact: vi.fn(),
    now: () => now,
  });

  expect(listReceived).toHaveBeenCalledWith('saved');
  expect(result.complete).toBe(true);
  expect(
    calls.find((call) => call.marker === 'inbox-recovery-complete')?.params[2],
  ).toEqual(scanStarted);
});

test('a superseded generation cannot enumerate or admit mail', async () => {
  const { executor, calls } = setup({
    'inbox-recovery-generation-lock': () => ({ rows: [] }),
  });
  const listReceived = vi.fn(async function* () {
    yield {
      id: 'incoming',
      to: ['brian@hashbrown.dev'],
      created_at: now.toISOString(),
    };
  });

  await expect(
    recoverInbox(executor, config, {
      listReceived,
      getSent: vi.fn(),
      getReceived: vi.fn(),
      stopContact: vi.fn(),
      now: () => now,
    }),
  ).rejects.toThrow('superseded');

  expect(calls.some((call) => call.marker === 'inbox-admit')).toBe(false);
});

test('unresolved forwarding cannot be reported as complete without a forwarding collaborator', async () => {
  const { executor, calls } = setup({
    'inbox-list-unforwarded': () => ({ rows: [{ id: 'incoming-1' }] }),
  });

  const result = await recoverInbox(executor, config, {
    listReceived: async function* () {
      yield* [];
    },
    getSent: vi.fn(),
    getReceived: vi.fn(),
    stopContact: vi.fn(),
    now: () => now,
  });

  expect(result.complete).toBe(false);
  expect(calls.some((call) => call.marker === 'inbox-recovery-complete')).toBe(
    false,
  );
});
