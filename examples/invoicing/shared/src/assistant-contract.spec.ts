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

const placeholders = {
  AssistantText: {},
  LedgerTable: {},
  TrendChart: {},
  AgingSummary: {},
  CustomerCard: {},
  ReviewPayment: {},
};

type ObjectSchema = {
  $ref?: string;
  properties?: Record<string, unknown>;
};

/** The component name each `ui` item alternative is keyed by. */
function componentNames(schema: Record<string, unknown>): string[] {
  const defs = schema['$defs'] as Record<string, ObjectSchema>;
  const ui = (
    schema['properties'] as { ui: { items: { anyOf: ObjectSchema[] } } }
  ).ui;
  return ui.items.anyOf.map((entry) => {
    const resolved = entry.$ref
      ? defs[entry.$ref.replace('#/$defs/', '')]
      : entry;
    const keys = Object.keys(resolved.properties ?? {});
    expect(keys).toHaveLength(1);
    return keys[0];
  });
}

test('the assistant schema names every kit component and nothing else', () => {
  expect(componentNames(assistantResponseSchema)).toEqual(names);
  expect(componentNames(assistantResponseSchema)).toHaveLength(6);
  const serialized = JSON.stringify(assistantResponseSchema);
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
  const [text, ...leaves] = createAssistantKit(placeholders);

  expect(text.children).toHaveLength(5);
  expect(text.children.map((c) => c.name)).toEqual(leaves.map((c) => c.name));
  for (const leaf of leaves) expect(leaf.children).toBe(false);
});

test('the kit schema accepts a full canonical tree and rejects unknown components', () => {
  const kit = ɵcreateUiKit({ components: createAssistantKit(placeholders) });
  const tree = {
    ui: [
      {
        AssistantText: {
          props: { text: 'Hi' },
          children: [
            { LedgerTable: { props: { title: 'T', recordIds: ['a'] } } },
            {
              TrendChart: {
                props: { currency: 'USD', customerId: null, months: 6 },
              },
            },
            { AgingSummary: { props: { currency: 'USD', customerId: 'c' } } },
            { CustomerCard: { props: { customerId: 'c' } } },
            { ReviewPayment: { props: { paymentId: 'p' } } },
          ],
        },
      },
    ],
  };
  expect(() => kit.schema.validate(tree)).not.toThrow();
  expect(() =>
    kit.schema.validate({ ui: [{ Bogus: { props: {} } }] }),
  ).toThrow();
});
