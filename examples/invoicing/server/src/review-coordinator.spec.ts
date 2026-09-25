import { expect, test } from 'vitest';
import { createSessionStore } from './session-store';
import { createReviewCoordinator } from './review-coordinator';
import { createMemoryRepositories } from './persistence/memory';
import { ConflictError } from './persistence/types';

const schema = { type: 'object', properties: { ui: { type: 'string' } } };
const request = {
  paymentId: 'payment-001',
  lines: [{ invoiceId: 'invoice-001', amountCents: 240000 }],
};
const body = () => ({
  threadId: 'thread-1',
  runId: 'run-1',
  state: { selectedPaymentId: request.paymentId },
  hashbrown: { ui: true, responseSchema: structuredClone(schema) },
});
const setup = async () => {
  const repositories = createMemoryRepositories();
  const store = createSessionStore(repositories.sessions);
  const session = await store.createSession();
  const coordinator = createReviewCoordinator(
    store,
    repositories.threads,
    schema,
  );
  const context = await coordinator.authorize(session, body());
  return { store, session, coordinator, context };
};
const resumed = (
  proposal: object,
  status = 'resolved',
  payload: unknown = 'once',
) => ({
  ...body(),
  state: { ...body().state, ...proposal },
  resume: [
    {
      interruptId: 'interrupt-1',
      status,
      ...(status === 'cancelled' ? {} : { payload }),
    },
  ],
});

test('authorizes only the exact UI schema and detaches it from caller mutation', async () => {
  const { coordinator, session, context } = await setup();
  const input = body();

  const authorized = await coordinator.authorize(session, input);
  input.hashbrown.responseSchema.properties.ui.type = 'number';

  expect(authorized.responseSchema).toEqual(schema);
  expect(context.responseSchema).toEqual(schema);
  await expect(coordinator.authorize(session, input)).rejects.toThrow(
    'invalid_response_schema',
  );
  await expect(
    coordinator.authorize(session, { ...body(), hashbrown: { ui: false } }),
  ).rejects.toThrow('invalid_ui_mode');
});

test.each([
  null,
  {},
  { ...body(), threadId: '' },
  { ...body(), runId: ' '.repeat(2) },
  { ...body(), threadId: 'a'.repeat(257) },
  { ...body(), state: { selectedPaymentId: 'unknown' } },
  { ...body(), tools: [{}] },
  { ...body(), forwardedProps: { amountCents: 1 } },
])('rejects malformed initial input %s', async (input) => {
  const { coordinator, session } = await setup();

  await expect(coordinator.authorize(session, input)).rejects.toThrow();
});

test('binds threads to one session, payment and generation', async () => {
  const repositories = createMemoryRepositories();
  const store = createSessionStore(repositories.sessions);
  const session = await store.createSession();
  const coordinator = createReviewCoordinator(
    {
      ...store,
      snapshot: async (id) => {
        const snapshot = await store.snapshot(id);
        return {
          ...snapshot,
          payments: [
            ...snapshot.payments,
            { ...snapshot.payments[0], id: 'payment-002' },
          ],
        };
      },
    },
    repositories.threads,
    schema,
  );
  const context = await coordinator.authorize(session, body());
  const other = await store.createSession();
  const otherPayment = 'payment-002';

  await expect(coordinator.authorize(other, body())).rejects.toThrow(
    'thread_binding_conflict',
  );
  await expect(
    coordinator.authorize(session, {
      ...body(),
      state: { selectedPaymentId: otherPayment },
    }),
  ).rejects.toThrow('thread_binding_conflict');
  await expect(coordinator.authorize('unknown', body())).rejects.toThrow(
    'session_not_found',
  );
  await store.reset(session);

  await expect(coordinator.authorize(session, body())).rejects.toThrow(
    'stale_generation',
  );
  await expect(coordinator.prepare(context, request)).rejects.toThrow(
    'stale_generation',
  );
});

test('prepares once without financial mutation and rejects conflicting allocations', async () => {
  const { coordinator, session, store, context } = await setup();
  const before = await store.snapshot(session);

  const proposal = await coordinator.prepare(context, request);
  Reflect.set(proposal, 'amountCents', 1);
  const again = await coordinator.prepare(context, request);

  expect(again.amountCents).toBe(request.lines[0].amountCents);
  expect(await store.snapshot(session)).toEqual(before);
  await expect(
    coordinator.prepare(context, {
      ...request,
      lines: [{ invoiceId: 'invoice-001', amountCents: 1 }],
    }),
  ).rejects.toThrow('proposal_conflict');
  await expect(
    coordinator.prepare(context, { ...request, paymentId: 'payment-002' }),
  ).rejects.toThrow('payment_binding_conflict');
  await expect(coordinator.apply(context, again.proposalId)).rejects.toThrow(
    'approval_required',
  );
});

test('reads proposals only through their owning session and thread', async () => {
  const { coordinator, session, store, context } = await setup();
  const proposal = await coordinator.prepare(context, request);

  expect(await coordinator.getProposal(session, 'thread-1')).toEqual(proposal);
  await expect(
    coordinator.getProposal(await store.createSession(), 'thread-1'),
  ).rejects.toThrow('thread_binding_conflict');
  await expect(coordinator.getProposal(session, 'unknown')).rejects.toThrow(
    'thread_not_found',
  );
});

test.each([
  [{ interruptId: 'interrupt-1', status: 'resolved', payload: 'always' }],
  [{ interruptId: 'interrupt-1', status: 'unknown' }],
  [{ interruptId: '', status: 'resolved', payload: 'once' }],
  [
    {
      interruptId: 'interrupt-1',
      status: 'resolved',
      payload: 'once',
      extra: true,
    },
  ],
  [{ interruptId: 'interrupt-1', status: 'cancelled', payload: 'once' }],
  [
    { interruptId: 'interrupt-1', status: 'cancelled' },
    { interruptId: 'interrupt-2', status: 'cancelled' },
  ],
  {},
  null,
])('rejects unsupported resume %s', async (resume) => {
  const { coordinator, session, context } = await setup();
  const proposal = await coordinator.prepare(context, request);

  await expect(
    coordinator.authorize(session, { ...resumed(proposal), resume }),
  ).rejects.toThrow('invalid_resume');
});

test.each([
  { proposalId: 'wrong' },
  { operationId: 'wrong' },
  { proposalVersion: 2 },
  { generation: 99 },
  { proposalVersion: undefined },
])('rejects incorrect proposal identity %s', async (patch) => {
  const { coordinator, session, context } = await setup();
  const proposal = await coordinator.prepare(context, request);

  await expect(
    coordinator.authorize(session, resumed({ ...proposal, ...patch })),
  ).rejects.toThrow('proposal_identity_conflict');
});

test('cancelled review cannot prepare or apply and changes no financial state', async () => {
  const { coordinator, session, store, context } = await setup();
  const proposal = await coordinator.prepare(context, request);
  const before = await store.snapshot(session);

  const cancelled = await coordinator.authorize(
    session,
    resumed(proposal, 'cancelled'),
  );

  await expect(coordinator.prepare(cancelled, request)).rejects.toThrow(
    'initial_request_required',
  );
  await expect(
    coordinator.apply(cancelled, proposal.proposalId),
  ).rejects.toThrow('approval_required');
  expect(await store.snapshot(session)).toEqual(before);
});

test('once resume applies only the stored proposal and duplicate apply is idempotent', async () => {
  const { coordinator, session, store, context } = await setup();
  const proposal = await coordinator.prepare(context, request);
  const approved = await coordinator.authorize(
    session,
    resumed({ ...proposal, amountCents: 1 }),
  );

  await expect(coordinator.apply(approved, 'wrong')).rejects.toThrow(
    'proposal_identity_conflict',
  );
  await expect(coordinator.prepare(approved, request)).rejects.toThrow(
    'initial_request_required',
  );
  const first = await coordinator.apply(approved, proposal.proposalId);
  const second = await coordinator.apply(approved, proposal.proposalId);

  expect(second).toEqual(first);
  expect((await store.snapshot(session)).allocations).toHaveLength(1);
  expect((await store.snapshot(session)).allocations[0].amountCents).toBe(
    request.lines[0].amountCents,
  );
});

test('forged capabilities and mutated public authority fields grant no approval', async () => {
  const { coordinator, context } = await setup();
  const proposal = await coordinator.prepare(context, request);

  await expect(
    coordinator.apply({ ...context, token: 'forged' }, proposal.proposalId),
  ).rejects.toThrow('invalid_review_context');
  await expect(
    coordinator.apply({ ...context, decision: 'once' }, proposal.proposalId),
  ).rejects.toThrow('approval_required');
});

test('reset invalidates an already authorized approval context', async () => {
  const { coordinator, session, store, context } = await setup();
  const proposal = await coordinator.prepare(context, request);
  const approved = await coordinator.authorize(session, resumed(proposal));

  await store.reset(session);

  await expect(
    coordinator.apply(approved, proposal.proposalId),
  ).rejects.toThrow('stale_generation');
  await expect(coordinator.getProposal(session, 'thread-1')).rejects.toThrow(
    'stale_generation',
  );
  expect((await store.snapshot(session)).allocations).toHaveLength(0);
});

test('competing writes are checked by the authoritative store during apply', async () => {
  const { coordinator, session, store, context } = await setup();
  const proposal = await coordinator.prepare(context, request);
  const approved = await coordinator.authorize(session, resumed(proposal));
  const competing = await store.propose(session, request);
  await store.decide(session, { ...competing, decision: 'approve' });

  await expect(
    coordinator.apply(approved, proposal.proposalId),
  ).rejects.toThrow('stale_version');

  expect((await store.snapshot(session)).allocations).toHaveLength(1);
  expect(
    await store.operationResult(session, proposal.operationId),
  ).toBeUndefined();
});

test('empty client containers are valid initial runs and reuse a bounded capability', async () => {
  const { coordinator, session, context } = await setup();

  const next = await coordinator.authorize(session, {
    ...body(),
    runId: 'run-2',
    tools: [],
    forwardedProps: {},
    resume: [],
  });

  expect(next.token).toBe(context.token);
  expect(next.decision).toBe('initial');
  expect((await coordinator.prepare(next, request)).amountCents).toBe(
    request.lines[0].amountCents,
  );
});

test('schema and public context cannot be mutated to change server authority', async () => {
  const repositories = createMemoryRepositories();
  const store = createSessionStore(repositories.sessions);
  const session = await store.createSession();
  const expected = structuredClone(schema);
  const coordinator = createReviewCoordinator(
    store,
    repositories.threads,
    expected,
  );
  const context = await coordinator.authorize(session, body());

  expected.properties.ui.type = 'number';
  Reflect.set(context, 'decision', 'once');
  const returnedSchema = context.responseSchema as typeof schema;
  Reflect.set(returnedSchema.properties.ui, 'type', 'number');
  const proposal = await coordinator.prepare(context, request);

  expect(context.responseSchema).toEqual(schema);
  expect((await coordinator.authorize(session, body())).responseSchema).toEqual(
    schema,
  );
  await expect(coordinator.apply(context, proposal.proposalId)).rejects.toThrow(
    'approval_required',
  );
});

test('resume cannot create a thread or approve a proposal that was never prepared', async () => {
  const { coordinator, session, context } = await setup();

  await expect(coordinator.authorize(session, resumed({}))).rejects.toThrow(
    'proposal_not_found',
  );
  await expect(
    coordinator.authorize(session, { ...resumed({}), threadId: 'unknown' }),
  ).rejects.toThrow('proposal_not_found');
  await expect(coordinator.getProposal(session, 'unknown')).rejects.toThrow(
    'thread_not_found',
  );

  expect((await coordinator.prepare(context, request)).amountCents).toBe(
    request.lines[0].amountCents,
  );
});

test.each([{ ui: true }, { ui: true, responseSchema: { type: 'number' } }])(
  'top-level schema cannot override a missing or incorrect Hashbrown schema %s',
  async (hashbrown) => {
    const repositories = createMemoryRepositories();
    const store = createSessionStore(repositories.sessions);
    const session = await store.createSession();
    const coordinator = createReviewCoordinator(
      store,
      repositories.threads,
      schema,
    );

    await expect(
      coordinator.authorize(session, {
        ...body(),
        hashbrown,
        responseSchema: schema,
      }),
    ).rejects.toThrow('invalid_response_schema');
  },
);

test('authorize converges on one token under contention', async () => {
  const repositories = createMemoryRepositories();
  const store = createSessionStore(repositories.sessions);
  const session = await store.createSession();
  const threads = repositories.threads;
  const realCommit = threads.commit.bind(threads);
  const competitorToken = 'competitor-token';
  let attempts = 0;
  threads.commit = async (threadId, expectedVersion, next) => {
    if (expectedVersion !== null && attempts < 2) {
      attempts += 1;
      if (attempts === 2) {
        // A competitor mints the token for the same decision and commits it
        // for real before this attempt's conflict is reported.
        const existing = await threads.load(threadId);
        await realCommit(threadId, existing!.version, {
          ...existing!.value,
          tokens: { ...existing!.value.tokens, initial: competitorToken },
        });
      }
      throw new ConflictError();
    }
    return realCommit(threadId, expectedVersion, next);
  };
  const coordinator = createReviewCoordinator(store, threads, schema);

  const context = await coordinator.authorize(session, body());

  expect(context.token).toBe(competitorToken);
  const record = await threads.load('thread-1');
  const tokens = Object.values(record!.value.tokens).filter(
    (value) => value === competitorToken,
  );
  expect(tokens).toHaveLength(1);
});
