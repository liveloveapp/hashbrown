import { s, ɵcreateUiKit } from '@hashbrownai/core';
import { expect, test } from 'vitest';
import { assistantResponseSchema, createAssistantKit } from './index';

const names = [
  'AssistantText',
  'LedgerTable',
  'TrendChart',
  'AgingSummary',
  'CustomerCard',
  'ReviewPayment',
];

test('the assistant schema names every kit component and nothing else', () => {
  const serialized = JSON.stringify(assistantResponseSchema);
  for (const name of names) expect(serialized).toContain(`"${name}"`);
  expect(serialized).not.toContain('AllocationProposal');
  expect(serialized).not.toContain('amountCents');
});

test('a kit built with any component implementations yields the same schema', () => {
  const kit = createAssistantKit({
    AssistantText: () => null,
    LedgerTable: () => null,
    TrendChart: () => null,
    AgingSummary: () => null,
    CustomerCard: () => null,
    ReviewPayment: () => null,
  });

  const schema = s.toJsonSchema(ɵcreateUiKit({ components: kit }).schema);

  expect(schema).toEqual(assistantResponseSchema);
  expect(kit.map((c) => c.name)).toEqual(names);
});

test('only AssistantText accepts children, and only leaf components', () => {
  const kit = createAssistantKit({
    AssistantText: {},
    LedgerTable: {},
    TrendChart: {},
    AgingSummary: {},
    CustomerCard: {},
    ReviewPayment: {},
  });
  const text = kit[0];
  const leaves = kit.slice(1);

  expect(Array.isArray(text.children)).toBe(true);
  expect((text.children as unknown[]).length).toBe(5);
  expect((text.children as { name: string }[]).map((c) => c.name)).toEqual(
    leaves.map((c) => c.name),
  );
  for (const leaf of leaves) expect(leaf.children).toBe(false);
});
