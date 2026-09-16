import { expect, it, test } from 'vitest';
import { createSessionStore } from './session-store';
import { createMemoryRepositories } from './persistence/memory';
import { ConflictError, type SessionRepository } from './persistence/types';
import { createSampleLedger } from './sample-ledger';

const request = {
  paymentId: 'payment-001',
  invoiceId: 'invoice-001',
  amountCents: 240000,
};

test('duplicate approval returns recorded result without duplicate effects', async () => {
  const store = createSessionStore(createMemoryRepositories().sessions);
  const session = await store.createSession();
  const proposal = await store.propose(session, request);

  const first = await store.decide(session, {
    ...proposal,
    decision: 'approve',
  });
  const second = await store.decide(session, {
    ...proposal,
    decision: 'approve',
  });

  expect(second).toEqual(first);
  expect((await store.snapshot(session)).allocations).toHaveLength(1);
  expect((await store.snapshot(session)).activities).toHaveLength(1);
});

test('decline changes no financial state and conflicting operation reuse is rejected', async () => {
  const store = createSessionStore(createMemoryRepositories().sessions);
  const session = await store.createSession();
  const proposal = await store.propose(session, request);
  const before = await store.snapshot(session);

  const result = await store.decide(session, {
    ...proposal,
    decision: 'decline',
  });

  expect(result.status).toBe('declined');
  expect(await store.snapshot(session)).toEqual(before);
  await expect(
    store.decide(session, { ...proposal, decision: 'approve' }),
  ).rejects.toThrow('operation_conflict');
});

test('an operation cannot be reused for a different proposal', async () => {
  const store = createSessionStore(createMemoryRepositories().sessions);
  const session = await store.createSession();
  const first = await store.propose(session, request);
  const second = await store.propose(session, request);
  await store.decide(session, { ...first, decision: 'approve' });

  await expect(
    store.decide(session, {
      ...second,
      operationId: first.operationId,
      decision: 'approve',
    }),
  ).rejects.toThrow('operation_conflict');

  expect((await store.snapshot(session)).allocations).toHaveLength(1);
});

test('sessions cannot read or apply other session proposals', async () => {
  const store = createSessionStore(createMemoryRepositories().sessions);
  const first = await store.createSession();
  const second = await store.createSession();
  const proposal = await store.propose(first, request);

  await expect(store.proposal(second, proposal.proposalId)).rejects.toThrow(
    'proposal_not_found',
  );
  await expect(
    store.decide(second, { ...proposal, decision: 'approve' }),
  ).rejects.toThrow('proposal_not_found');

  expect((await store.snapshot(first)).allocations).toHaveLength(0);
  await expect(store.snapshot('unknown')).rejects.toThrow('session_not_found');
});

test('reset invalidates old proposals', async () => {
  const store = createSessionStore(createMemoryRepositories().sessions);
  const session = await store.createSession();
  const proposal = await store.propose(session, request);

  await store.reset(session);

  await expect(
    store.decide(session, { ...proposal, decision: 'approve' }),
  ).rejects.toThrow('stale_generation');
  expect((await store.snapshot(session)).allocations).toHaveLength(0);
});

test('concurrent approvals commit once', async () => {
  const store = createSessionStore(createMemoryRepositories().sessions);
  const session = await store.createSession();
  const proposal = await store.propose(session, request);

  const results = await Promise.all(
    [0, 1].map(() =>
      Promise.resolve().then(() =>
        store.decide(session, { ...proposal, decision: 'approve' }),
      ),
    ),
  );

  expect(results[0]).toEqual(results[1]);
  expect((await store.snapshot(session)).allocations).toHaveLength(1);
});

test('external mutation and extra amount cannot change authoritative proposal or snapshot', async () => {
  const store = createSessionStore(createMemoryRepositories().sessions);
  const session = await store.createSession();
  const proposal = await store.propose(session, request);
  const snapshot = await store.snapshot(session);

  Reflect.set(proposal, 'amountCents', 1);
  Reflect.set(snapshot.payments[0], 'amountCents', 1);
  const forged = { ...proposal, amountCents: 1, decision: 'approve' as const };
  await store.decide(session, forged);

  expect((await store.snapshot(session)).allocations[0].amountCents).toBe(
    240000,
  );
});

test('a stale competing proposal has no recorded result or effects', async () => {
  const store = createSessionStore(createMemoryRepositories().sessions);
  const session = await store.createSession();
  const first = await store.propose(session, request);
  const second = await store.propose(session, request);
  await store.decide(session, { ...first, decision: 'approve' });
  const before = await store.snapshot(session);

  await expect(
    store.decide(session, { ...second, decision: 'approve' }),
  ).rejects.toThrow('stale_version');

  expect(
    await store.operationResult(session, second.operationId),
  ).toBeUndefined();
  expect(await store.snapshot(session)).toEqual(before);
  expect(
    await store.operationResult(await store.createSession(), first.operationId),
  ).toBeUndefined();
});

test.each([
  { proposalVersion: 2, error: 'stale_proposal' },
  { operationId: 'forged', error: 'operation_conflict' },
  { generation: 2, error: 'stale_generation' },
])('rejects forged decision identity %s', async (patch) => {
  const store = createSessionStore(createMemoryRepositories().sessions);
  const session = await store.createSession();
  const proposal = await store.propose(session, request);

  await expect(
    store.decide(session, { ...proposal, ...patch, decision: 'approve' }),
  ).rejects.toThrow(patch.error);

  expect((await store.snapshot(session)).allocations).toHaveLength(0);
});

test('operation results are isolated copies', async () => {
  const store = createSessionStore(createMemoryRepositories().sessions);
  const session = await store.createSession();
  const proposal = await store.propose(session, request);
  const result = await store.decide(session, {
    ...proposal,
    decision: 'approve',
  });

  Reflect.set(result.snapshot.allocations[0], 'amountCents', 1);
  const recorded = await store.operationResult(session, proposal.operationId);
  if (!recorded) throw new Error('Expected recorded result');
  Reflect.set(recorded.snapshot.allocations[0], 'amountCents', 2);

  expect(
    (await store.operationResult(session, proposal.operationId))?.snapshot
      .allocations[0].amountCents,
  ).toBe(240000);
});

test('generation is server owned and advances on reset', async () => {
  const store = createSessionStore(createMemoryRepositories().sessions);
  const session = await store.createSession();
  const first = await store.generation(session);

  await store.reset(session);

  expect(first).toBe(1);
  expect(await store.generation(session)).toBe(2);
  await expect(store.generation('unknown')).rejects.toThrow(
    'session_not_found',
  );
});

it('retries a mutation once when the document moved underneath it', async () => {
  const repos = createMemoryRepositories();
  const store = createSessionStore(repos.sessions, createSampleLedger);
  const id = await store.createSession();
  const original = repos.sessions.commit.bind(repos.sessions);
  let injected = false;
  (repos.sessions as { commit: SessionRepository['commit'] }).commit = async (
    sid,
    version,
    next,
  ) => {
    if (!injected) {
      injected = true;
      await original(sid, version, next); // a concurrent writer wins first
      throw new ConflictError();
    }
    return original(sid, version, next);
  };
  const before = await store.snapshot(id);
  const payment = before.payments.find((p) => p.unappliedCents > 0)!;
  const invoice = before.invoices.find(
    (i) => i.customerId === payment.customerId && i.outstandingCents > 0,
  )!;
  const proposal = await store.propose(id, {
    paymentId: payment.id,
    invoiceId: invoice.id,
    amountCents: Math.min(payment.unappliedCents, invoice.outstandingCents),
  });
  expect(proposal.proposalId).toBeTruthy();
  expect(
    Object.keys((await repos.sessions.load(id))!.value.proposals),
  ).toHaveLength(2);
});
