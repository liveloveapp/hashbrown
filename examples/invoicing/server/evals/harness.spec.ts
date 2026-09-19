import { afterAll, beforeAll, expect, test } from 'vitest';
import { script } from '@b4run/testing';
import { createInvoicingHarness, type InvoicingHarness } from './harness';

let harness: InvoicingHarness;

beforeAll(async () => {
  harness = await createInvoicingHarness({ mode: 'replay' });
}, 60_000);
afterAll(async () => {
  await harness.close();
});

test('replays a scripted answer through the real route, middleware, tools and render', async () => {
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

  expect(run.error).toBeUndefined();
  expect(run.toolCalls.map((c) => c.name)).toEqual([
    'unappliedPayments',
    'render',
  ]);
  expect(run.toolResults.every((r) => !r.isError)).toBe(true);
  expect(String(run.toolResults[0].content)).toContain('"paymentCount":5');
  expect(run.finalMessage).toBe('{"ui":[]}');
  expect(run.messages.map((m) => m.content)).toContain(canonical);
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

test('marks advance with the journal and only record mode can window it', async () => {
  const before = harness.mark();
  expect(before).toEqual({
    journalStart: expect.any(Number),
    fixtureStart: expect.any(Number),
  });

  await harness.run({
    input: 'Mark me',
    fixtures: script().user('Mark me').replies('{"ui":[]}').build(),
  });

  const after = harness.mark();
  expect(after.journalStart).toBeGreaterThan(before.journalStart);
  expect(() => harness.recordedFixturesSince(before)).toThrow(/record mode/);
  expect(() => harness.recordedFixturesSince(before, after)).toThrow(
    /record mode/,
  );
  expect(() => harness.lastRecordedFixtures()).toThrow(/record mode/);
}, 60_000);
