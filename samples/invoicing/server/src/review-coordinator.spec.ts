import { expect, test } from 'vitest';
import { createSessionStore } from './session-store';
import { createReviewCoordinator } from './review-coordinator';

const schema = { type: 'object', properties: { ui: { type: 'string' } } };
const request = {
  paymentId: 'payment-001',
  invoiceId: 'invoice-001',
  amountCents: 240000,
};
const body = () => ({
  threadId: 'thread-1',
  runId: 'run-1',
  state: { selectedPaymentId: request.paymentId },
  hashbrown: { ui: true, responseSchema: structuredClone(schema) },
});
const setup = () => {
  const store = createSessionStore();
  const session = store.createSession();
  const coordinator = createReviewCoordinator(store, schema);
  const context = coordinator.authorize(session, body());
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

test('authorizes only the exact UI schema and detaches it from caller mutation', () => {
  const { coordinator, session, context } = setup();
  const input = body();

  const authorized = coordinator.authorize(session, input);
  input.hashbrown.responseSchema.properties.ui.type = 'number';

  expect(authorized.responseSchema).toEqual(schema);
  expect(context.responseSchema).toEqual(schema);
  expect(() => coordinator.authorize(session, input)).toThrow(
    'invalid_response_schema',
  );
  expect(() =>
    coordinator.authorize(session, { ...body(), hashbrown: { ui: false } }),
  ).toThrow('invalid_ui_mode');
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
])('rejects malformed initial input %s', (input) => {
  const { coordinator, session } = setup();

  expect(() => coordinator.authorize(session, input)).toThrow();
});

test('binds threads to one session, payment and generation', () => {
  const store = createSessionStore();
  const session = store.createSession();
  const coordinator = createReviewCoordinator(
    {
      ...store,
      snapshot: (id) => {
        const snapshot = store.snapshot(id);
        return {
          ...snapshot,
          payments: [
            ...snapshot.payments,
            { ...snapshot.payments[0], id: 'payment-002' },
          ],
        };
      },
    },
    schema,
  );
  const context = coordinator.authorize(session, body());
  const other = store.createSession();
  const otherPayment = 'payment-002';

  expect(() => coordinator.authorize(other, body())).toThrow(
    'thread_binding_conflict',
  );
  expect(() =>
    coordinator.authorize(session, {
      ...body(),
      state: { selectedPaymentId: otherPayment },
    }),
  ).toThrow('thread_binding_conflict');
  expect(() => coordinator.authorize('unknown', body())).toThrow(
    'session_not_found',
  );
  store.reset(session);

  expect(() => coordinator.authorize(session, body())).toThrow(
    'stale_generation',
  );
  expect(() => coordinator.prepare(context, request)).toThrow(
    'stale_generation',
  );
});

test('prepares once without financial mutation and rejects conflicting allocations', () => {
  const { coordinator, session, store, context } = setup();
  const before = store.snapshot(session);

  const proposal = coordinator.prepare(context, request);
  Reflect.set(proposal, 'amountCents', 1);
  const again = coordinator.prepare(context, request);

  expect(again.amountCents).toBe(request.amountCents);
  expect(store.snapshot(session)).toEqual(before);
  expect(() =>
    coordinator.prepare(context, { ...request, amountCents: 1 }),
  ).toThrow('proposal_conflict');
  expect(() =>
    coordinator.prepare(context, { ...request, paymentId: 'payment-002' }),
  ).toThrow('payment_binding_conflict');
  expect(() => coordinator.apply(context, again.proposalId)).toThrow(
    'approval_required',
  );
});

test('reads proposals only through their owning session and thread', () => {
  const { coordinator, session, store, context } = setup();
  const proposal = coordinator.prepare(context, request);

  expect(coordinator.getProposal(session, 'thread-1')).toEqual(proposal);
  expect(() =>
    coordinator.getProposal(store.createSession(), 'thread-1'),
  ).toThrow('thread_binding_conflict');
  expect(() => coordinator.getProposal(session, 'unknown')).toThrow(
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
])('rejects unsupported resume %s', (resume) => {
  const { coordinator, session, context } = setup();
  const proposal = coordinator.prepare(context, request);

  expect(() =>
    coordinator.authorize(session, { ...resumed(proposal), resume }),
  ).toThrow('invalid_resume');
});

test.each([
  { proposalId: 'wrong' },
  { operationId: 'wrong' },
  { proposalVersion: 2 },
  { generation: 99 },
  { proposalVersion: undefined },
])('rejects incorrect proposal identity %s', (patch) => {
  const { coordinator, session, context } = setup();
  const proposal = coordinator.prepare(context, request);

  expect(() =>
    coordinator.authorize(session, resumed({ ...proposal, ...patch })),
  ).toThrow('proposal_identity_conflict');
});

test('cancelled review cannot prepare or apply and changes no financial state', () => {
  const { coordinator, session, store, context } = setup();
  const proposal = coordinator.prepare(context, request);
  const before = store.snapshot(session);

  const cancelled = coordinator.authorize(
    session,
    resumed(proposal, 'cancelled'),
  );

  expect(() => coordinator.prepare(cancelled, request)).toThrow(
    'initial_request_required',
  );
  expect(() => coordinator.apply(cancelled, proposal.proposalId)).toThrow(
    'approval_required',
  );
  expect(store.snapshot(session)).toEqual(before);
});

test('once resume applies only the stored proposal and duplicate apply is idempotent', () => {
  const { coordinator, session, store, context } = setup();
  const proposal = coordinator.prepare(context, request);
  const approved = coordinator.authorize(
    session,
    resumed({ ...proposal, amountCents: 1 }),
  );

  expect(() => coordinator.apply(approved, 'wrong')).toThrow(
    'proposal_identity_conflict',
  );
  expect(() => coordinator.prepare(approved, request)).toThrow(
    'initial_request_required',
  );
  const first = coordinator.apply(approved, proposal.proposalId);
  const second = coordinator.apply(approved, proposal.proposalId);

  expect(second).toEqual(first);
  expect(store.snapshot(session).allocations).toHaveLength(1);
  expect(store.snapshot(session).allocations[0].amountCents).toBe(
    request.amountCents,
  );
});

test('forged capabilities and mutated public authority fields grant no approval', () => {
  const { coordinator, context } = setup();
  const proposal = coordinator.prepare(context, request);

  expect(() =>
    coordinator.apply({ ...context, token: 'forged' }, proposal.proposalId),
  ).toThrow('invalid_review_context');
  expect(() =>
    coordinator.apply({ ...context, decision: 'once' }, proposal.proposalId),
  ).toThrow('approval_required');
});

test('reset invalidates an already authorized approval context', () => {
  const { coordinator, session, store, context } = setup();
  const proposal = coordinator.prepare(context, request);
  const approved = coordinator.authorize(session, resumed(proposal));

  store.reset(session);

  expect(() => coordinator.apply(approved, proposal.proposalId)).toThrow(
    'stale_generation',
  );
  expect(() => coordinator.getProposal(session, 'thread-1')).toThrow(
    'stale_generation',
  );
  expect(store.snapshot(session).allocations).toHaveLength(0);
});

test('competing writes are checked by the authoritative store during apply', () => {
  const { coordinator, session, store, context } = setup();
  const proposal = coordinator.prepare(context, request);
  const approved = coordinator.authorize(session, resumed(proposal));
  const competing = store.propose(session, request);
  store.decide(session, { ...competing, decision: 'approve' });

  expect(() => coordinator.apply(approved, proposal.proposalId)).toThrow(
    'stale_version',
  );

  expect(store.snapshot(session).allocations).toHaveLength(1);
  expect(store.operationResult(session, proposal.operationId)).toBeUndefined();
});

test('empty client containers are valid initial runs and reuse a bounded capability', () => {
  const { coordinator, session, context } = setup();

  const next = coordinator.authorize(session, {
    ...body(),
    runId: 'run-2',
    tools: [],
    forwardedProps: {},
    resume: [],
  });

  expect(next.token).toBe(context.token);
  expect(next.decision).toBe('initial');
  expect(coordinator.prepare(next, request).amountCents).toBe(
    request.amountCents,
  );
});

test('schema and public context cannot be mutated to change server authority', () => {
  const store = createSessionStore();
  const session = store.createSession();
  const expected = structuredClone(schema);
  const coordinator = createReviewCoordinator(store, expected);
  const context = coordinator.authorize(session, body());

  expected.properties.ui.type = 'number';
  Reflect.set(context, 'decision', 'once');
  const returnedSchema = context.responseSchema as typeof schema;
  Reflect.set(returnedSchema.properties.ui, 'type', 'number');
  const proposal = coordinator.prepare(context, request);

  expect(context.responseSchema).toEqual(schema);
  expect(coordinator.authorize(session, body()).responseSchema).toEqual(schema);
  expect(() => coordinator.apply(context, proposal.proposalId)).toThrow(
    'approval_required',
  );
});

test('resume cannot create a thread or approve a proposal that was never prepared', () => {
  const { coordinator, session, context } = setup();

  expect(() => coordinator.authorize(session, resumed({}))).toThrow(
    'proposal_not_found',
  );
  expect(() =>
    coordinator.authorize(session, { ...resumed({}), threadId: 'unknown' }),
  ).toThrow('proposal_not_found');

  expect(coordinator.prepare(context, request).amountCents).toBe(
    request.amountCents,
  );
});

test.each([{ ui: true }, { ui: true, responseSchema: { type: 'number' } }])(
  'top-level schema cannot override a missing or incorrect Hashbrown schema %s',
  (hashbrown) => {
    const store = createSessionStore();
    const session = store.createSession();
    const coordinator = createReviewCoordinator(store, schema);

    expect(() =>
      coordinator.authorize(session, {
        ...body(),
        hashbrown,
        responseSchema: schema,
      }),
    ).toThrow('invalid_response_schema');
  },
);
