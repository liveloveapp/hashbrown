import { afterAll, beforeAll, expect, test } from 'vitest';
import { script } from '@b4run/testing';
import { assistantResponseSchema } from '@invoicing/contracts';
import { createAssistantMiddleware } from '../src/assistant-middleware';
import { createMemoryRepositories } from '../src/persistence/memory';
import { createSampleLedger } from '../src/sample-ledger';
import { createSessionStore } from '../src/session-store';
import {
  createInvoicingHarness,
  evalMiddlewareContext,
  type InvoicingHarness,
} from './harness';

let harness: InvoicingHarness;

beforeAll(async () => {
  harness = await createInvoicingHarness({ mode: 'replay' });
}, 60_000);
afterAll(async () => {
  await harness.close();
});

test('the harness context exposes exactly what the route middleware does', async () => {
  const repositories = createMemoryRepositories();
  const store = createSessionStore(repositories.sessions, createSampleLedger());
  const session = await store.createSession();
  const middleware = createAssistantMiddleware(store, repositories.threads);
  const result = await middleware({
    method: 'POST',
    routeId: '/assistant',
    headers: { cookie: `invoicing_session=${session}` },
    body: {
      threadId: 'conversation',
      runId: 'turn',
      state: {},
      hashbrown: { ui: true, responseSchema: assistantResponseSchema },
    },
  });
  if (result.action !== 'continue') throw new Error('expected continue');

  const evalContext = evalMiddlewareContext();

  expect(Object.keys(evalContext).sort()).toEqual(
    Object.keys(result.context).sort(),
  );
  expect(evalContext.responseSchema).toBe(result.context.responseSchema);
  expect(await evalContext.ledgerSummary()).toEqual(
    await result.context.ledgerSummary(),
  );
});

test('replays a scripted answer through the real agent, tools and render', async () => {
  const canonical =
    '{"ui":[{"AssistantText":{"props":{"text":"There are five."},"children":[]}}]}';
  const fixtures = [
    ...script()
      .user('How many payments need matching?')
      .callsTool('unappliedPayments', {})
      .callsTool('render', { text: 'There are five.', components: [] })
      .replies('{"ui":[]}')
      .build(),
    {
      match: { userMessage: 'Return exactly this JSON' },
      response: { content: canonical },
    },
  ];

  const run = await harness.run({
    input: 'How many payments need matching?',
    fixtures,
  });

  expect(run.toolCalls.map((c) => c.name)).toEqual([
    'unappliedPayments',
    'render',
  ]);
  expect(run.toolResults.every((r) => !r.isError)).toBe(true);
  expect(String(run.toolResults[0].content)).toContain('"paymentCount":5');
  expect(run.finalMessage).toBe('{"ui":[]}');
  // The render tool validates and returns; the browser renders the answer
  // from the call's own arguments, so nothing is echoed as assistant text.
  expect(String(run.toolResults[1].content)).toContain('"rendered":true');
  expect(run.tokens).not.toContain(canonical);
}, 60_000);

test('a rejected render surfaces as a tool error the model could act on', async () => {
  const fixtures = script()
    .user('Bad render')
    .callsTool('render', {
      text: 'x',
      components: [{ CustomerCard: { customerId: 'nobody' } }],
    })
    .replies('{"ui":[]}')
    .build();

  const run = await harness.run({ input: 'Bad render', fixtures });

  expect(run.toolResults[0]).toMatchObject({ name: 'render', isError: true });
  expect(String(run.toolResults[0].content)).toContain(
    'unknown customer nobody',
  );
}, 60_000);

test('each run starts a fresh thread and only record mode can read the tape', async () => {
  const first = await harness.run({
    input: 'Fresh thread',
    fixtures: script().user('Fresh thread').replies('{"ui":[]}').build(),
  });
  const second = await harness.run({
    input: 'Fresh thread',
    fixtures: script().user('Fresh thread').replies('{"ui":[]}').build(),
  });

  expect(second.threadId).not.toBe(first.threadId);
  expect(() => harness.getRecordedFixtures()).toThrow(/record mode/);
}, 60_000);
