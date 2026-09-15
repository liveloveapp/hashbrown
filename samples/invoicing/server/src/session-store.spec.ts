import { expect, test } from 'vitest';
import { createSessionStore } from './session-store';

const request = {
  paymentId: 'payment-001',
  invoiceId: 'invoice-001',
  amountCents: 240000,
};

test('duplicate approval returns recorded result without duplicate effects', () => {
  const store = createSessionStore();
  const session = store.createSession();
  const proposal = store.propose(session, request);

  const first = store.decide(session, { ...proposal, decision: 'approve' });
  const second = store.decide(session, { ...proposal, decision: 'approve' });

  expect(second).toEqual(first);
  expect(store.snapshot(session).allocations).toHaveLength(1);
  expect(store.snapshot(session).activities).toHaveLength(1);
});

test('decline changes no financial state and conflicting operation reuse is rejected', () => {
  const store = createSessionStore();
  const session = store.createSession();
  const proposal = store.propose(session, request);
  const before = store.snapshot(session);

  const result = store.decide(session, { ...proposal, decision: 'decline' });

  expect(result.status).toBe('declined');
  expect(store.snapshot(session)).toEqual(before);
  expect(() =>
    store.decide(session, { ...proposal, decision: 'approve' }),
  ).toThrow('operation_conflict');
});

test('an operation cannot be reused for a different proposal', () => {
  const store = createSessionStore();
  const session = store.createSession();
  const first = store.propose(session, request);
  const second = store.propose(session, request);
  store.decide(session, { ...first, decision: 'approve' });

  expect(() =>
    store.decide(session, {
      ...second,
      operationId: first.operationId,
      decision: 'approve',
    }),
  ).toThrow('operation_conflict');

  expect(store.snapshot(session).allocations).toHaveLength(1);
});

test('sessions cannot read or apply other session proposals', () => {
  const store = createSessionStore();
  const first = store.createSession();
  const second = store.createSession();
  const proposal = store.propose(first, request);

  expect(() => store.proposal(second, proposal.proposalId)).toThrow(
    'proposal_not_found',
  );
  expect(() =>
    store.decide(second, { ...proposal, decision: 'approve' }),
  ).toThrow('proposal_not_found');

  expect(store.snapshot(first).allocations).toHaveLength(0);
  expect(() => store.snapshot('unknown')).toThrow('session_not_found');
});

test('reset invalidates old proposals', () => {
  const store = createSessionStore();
  const session = store.createSession();
  const proposal = store.propose(session, request);

  store.reset(session);

  expect(() =>
    store.decide(session, { ...proposal, decision: 'approve' }),
  ).toThrow('stale_generation');
  expect(store.snapshot(session).allocations).toHaveLength(0);
});

test('concurrent approvals commit once', async () => {
  const store = createSessionStore();
  const session = store.createSession();
  const proposal = store.propose(session, request);

  const results = await Promise.all(
    [0, 1].map(() =>
      Promise.resolve().then(() =>
        store.decide(session, { ...proposal, decision: 'approve' }),
      ),
    ),
  );

  expect(results[0]).toEqual(results[1]);
  expect(store.snapshot(session).allocations).toHaveLength(1);
});

test('external mutation and extra amount cannot change authoritative proposal or snapshot', () => {
  const store = createSessionStore();
  const session = store.createSession();
  const proposal = store.propose(session, request);
  const snapshot = store.snapshot(session);

  Reflect.set(proposal, 'amountCents', 1);
  Reflect.set(snapshot.payments[0], 'amountCents', 1);
  const forged = { ...proposal, amountCents: 1, decision: 'approve' as const };
  store.decide(session, forged);

  expect(store.snapshot(session).allocations[0].amountCents).toBe(240000);
});

test('a stale competing proposal has no recorded result or effects', () => {
  const store = createSessionStore();
  const session = store.createSession();
  const first = store.propose(session, request);
  const second = store.propose(session, request);
  store.decide(session, { ...first, decision: 'approve' });
  const before = store.snapshot(session);

  expect(() =>
    store.decide(session, { ...second, decision: 'approve' }),
  ).toThrow('stale_version');

  expect(store.operationResult(session, second.operationId)).toBeUndefined();
  expect(store.snapshot(session)).toEqual(before);
  expect(
    store.operationResult(store.createSession(), first.operationId),
  ).toBeUndefined();
});

test.each([
  { proposalVersion: 2, error: 'stale_proposal' },
  { operationId: 'forged', error: 'operation_conflict' },
  { generation: 2, error: 'stale_generation' },
])('rejects forged decision identity %s', (patch) => {
  const store = createSessionStore();
  const session = store.createSession();
  const proposal = store.propose(session, request);

  expect(() =>
    store.decide(session, { ...proposal, ...patch, decision: 'approve' }),
  ).toThrow(patch.error);

  expect(store.snapshot(session).allocations).toHaveLength(0);
});

test('operation results are isolated copies', () => {
  const store = createSessionStore();
  const session = store.createSession();
  const proposal = store.propose(session, request);
  const result = store.decide(session, { ...proposal, decision: 'approve' });

  Reflect.set(result.snapshot.allocations[0], 'amountCents', 1);
  const recorded = store.operationResult(session, proposal.operationId);
  if (!recorded) throw new Error('Expected recorded result');
  Reflect.set(recorded.snapshot.allocations[0], 'amountCents', 2);

  expect(
    store.operationResult(session, proposal.operationId)?.snapshot
      .allocations[0].amountCents,
  ).toBe(240000);
});
