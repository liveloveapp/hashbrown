import { expect, test } from 'vitest';
import {
  applyProposal,
  createProposal,
  fillLines,
  getSnapshot,
} from './ledger';
import { createSampleLedger, sampleScenarios } from './sample-ledger';
import { createSessionStore } from './session-store';
import { createMemoryRepositories } from './persistence/memory';

/** Require a seeded test record and preserve its inferred type. */
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing seeded record');
  return value;
}

test('creates deterministic independent records spanning 24 consulting months', () => {
  const first = createSampleLedger();

  const second = createSampleLedger();
  const months = new Set(
    first.invoices.map((record) => record.date?.slice(0, 7)),
  );

  expect(second).toEqual(first);
  expect(second.invoices[0]).not.toBe(first.invoices[0]);
  expect(months.size).toBe(24);
  expect([...months].sort()[0]).toBe('2024-10');
  expect([...months].sort().at(-1)).toBe('2026-09');
  expect(first.customers).toHaveLength(12);
  expect(
    new Set(first.invoices.map((record) => record.customerName)).size,
  ).toBe(12);
  expect(new Set(first.customers.map((c) => c.currency))).toEqual(
    new Set(['USD', 'EUR', 'GBP']),
  );
  for (const record of [...first.invoices, ...first.payments]) {
    expect(record.customerName).toBeTruthy();
    expect(record.reference).toBeTruthy();
    expect(record.description).toBeTruthy();
    expect(record.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(required(record.date) <= '2026-09-15').toBe(true);
  }
});

test('conserves cents with valid unique history and no overallocations', () => {
  const ledger = createSampleLedger();

  const snapshot = getSnapshot(ledger);
  const allocated = ledger.allocations.reduce(
    (sum, item) => sum + item.amountCents,
    0,
  );

  expect(ledger.allocations.length).toBeGreaterThanOrEqual(
    23 * ledger.customers.length,
  );
  expect(
    new Set([...ledger.invoices, ...ledger.payments].map((item) => item.id))
      .size,
  ).toBe(ledger.invoices.length + ledger.payments.length);
  expect(new Set(ledger.allocations.map((item) => item.proposalId)).size).toBe(
    ledger.allocations.length,
  );
  expect(new Set(ledger.activities.map((item) => item.operationId)).size).toBe(
    ledger.activities.length,
  );
  for (const allocation of ledger.allocations) {
    const payment = required(
      ledger.payments.find((item) => item.id === allocation.paymentId),
    );
    const invoice = required(
      ledger.invoices.find((item) => item.id === allocation.invoiceId),
    );
    expect(payment).toBeDefined();
    expect(invoice).toBeDefined();
    expect(payment.customerId).toBe(invoice.customerId);
    expect(payment.currency).toBe(invoice.currency);
    expect(Number.isSafeInteger(allocation.amountCents)).toBe(true);
    expect(allocation.amountCents).toBeGreaterThan(0);
    expect(
      ledger.activities.some(
        (item) => item.proposalId === allocation.proposalId,
      ),
    ).toBe(true);
  }
  for (const record of snapshot.payments)
    expect(record.unappliedCents).toBeGreaterThanOrEqual(0);
  for (const record of snapshot.invoices)
    expect(record.outstandingCents).toBeGreaterThanOrEqual(0);
  expect(
    snapshot.payments.reduce(
      (sum, item) => sum + item.unappliedCents,
      allocated,
    ),
  ).toBe(ledger.payments.reduce((sum, item) => sum + item.amountCents, 0));
  expect(
    snapshot.invoices.reduce(
      (sum, item) => sum + item.outstandingCents,
      allocated,
    ),
  ).toBe(ledger.invoices.reduce((sum, item) => sum + item.amountCents, 0));
});

test('provides exact, partial, combined, ambiguous, and advance payment scenarios', () => {
  const ledger = createSampleLedger();

  const snapshot = getSnapshot(ledger);
  const payment = (id: string) =>
    required(snapshot.payments.find((item) => item.id === id));
  const invoice = (id: string) =>
    required(snapshot.invoices.find((item) => item.id === id));

  expect(payment(sampleScenarios.exact.paymentId).reference).toContain(
    invoice(sampleScenarios.exact.invoiceId).reference,
  );
  expect(payment(sampleScenarios.exact.paymentId).unappliedCents).toBe(
    invoice(sampleScenarios.exact.invoiceId).outstandingCents,
  );
  expect(
    payment(sampleScenarios.partial.paymentId).unappliedCents,
  ).toBeLessThan(invoice(sampleScenarios.partial.invoiceId).outstandingCents);
  expect(payment(sampleScenarios.combined.paymentId).unappliedCents).toBe(
    sampleScenarios.combined.invoiceIds.reduce(
      (sum, id) => sum + invoice(id).outstandingCents,
      0,
    ),
  );
  expect(
    sampleScenarios.ambiguous.invoiceIds.map(
      (id) => invoice(id).outstandingCents,
    ),
  ).toEqual([
    payment(sampleScenarios.ambiguous.paymentId).unappliedCents,
    payment(sampleScenarios.ambiguous.paymentId).unappliedCents,
  ]);
  expect(
    snapshot.invoices
      .filter(
        (item) =>
          item.customerId ===
          payment(sampleScenarios.advance.paymentId).customerId,
      )
      .every((item) => item.outstandingCents === 0),
  ).toBe(true);
  // The scenario invoices are the only open candidates for their payments, so
  // the review flows never have to choose between a scenario and history.
  for (const customerId of ['northstar', 'cedar', 'harbor', 'atlas']) {
    const openIds = snapshot.invoices
      .filter((i) => i.customerId === customerId && i.outstandingCents > 0)
      .map((i) => i.id)
      .sort();
    const expected = {
      northstar: [sampleScenarios.exact.invoiceId],
      cedar: [sampleScenarios.partial.invoiceId],
      harbor: [...sampleScenarios.combined.invoiceIds],
      atlas: [...sampleScenarios.ambiguous.invoiceIds],
    }[customerId];
    expect(openIds).toEqual([...(expected ?? [])].sort());
  }
});

test('applies a combined payment across both invoices in one proposal', () => {
  const initial = createSampleLedger();
  const snapshot = getSnapshot(initial);
  const payment = required(
    snapshot.payments.find(
      (item) => item.id === sampleScenarios.combined.paymentId,
    ),
  );
  const invoices = sampleScenarios.combined.invoiceIds.map((id) =>
    required(snapshot.invoices.find((item) => item.id === id)),
  );

  const result = applyProposal(
    initial,
    createProposal(
      initial,
      {
        paymentId: payment.id,
        lines: fillLines(payment.unappliedCents, invoices),
      },
      { generation: 1, proposalId: 'test-proposal', operationId: 'test-op' },
    ),
  );

  expect(
    getSnapshot(result).payments.find((item) => item.id === payment.id)
      ?.unappliedCents,
  ).toBe(0);
  expect(result.allocations.length).toBe(initial.allocations.length + 2);
  expect(result.activities.length).toBe(initial.activities.length + 1);
  expect(createSampleLedger()).toEqual(initial);
});

test('reset restores sample allocations after approval without affecting another session', async () => {
  const store = createSessionStore(
    createMemoryRepositories().sessions,
    createSampleLedger(),
  );
  const first = await store.createSession();
  const second = await store.createSession();
  const baseline = await store.snapshot(first);
  const proposal = await store.propose(first, {
    paymentId: sampleScenarios.partial.paymentId,
    lines: [
      { invoiceId: sampleScenarios.partial.invoiceId, amountCents: 200000 },
    ],
  });

  const approved = await store.decide(first, {
    ...proposal,
    decision: 'approve',
  });
  const reset = await store.reset(first);

  expect(
    approved.snapshot.invoices.find(
      (item) => item.id === sampleScenarios.partial.invoiceId,
    )?.outstandingCents,
  ).toBe(300000);
  expect(reset).toEqual(baseline);
  expect(await store.snapshot(second)).toEqual(baseline);
  expect(
    await store.operationResult(first, proposal.operationId),
  ).toBeUndefined();
  await expect(
    store.decide(first, { ...proposal, decision: 'approve' }),
  ).rejects.toThrow('stale_generation');
});
