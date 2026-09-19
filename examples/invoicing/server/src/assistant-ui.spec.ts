import { expect, test } from 'vitest';
import { ɵcreateUiKit } from '@hashbrownai/core';
import {
  type AssistantRenderInput,
  createAssistantKit,
} from '@invoicing/contracts';
import { getSnapshot } from './ledger';
import { createSampleLedger, sampleScenarios } from './sample-ledger';
import { renderUi, validateUi } from './assistant-ui';

const snapshot = getSnapshot(createSampleLedger());
const full: AssistantRenderInput = {
  text: 'Atlas has two open invoices.',
  components: [
    {
      LedgerTable: {
        title: 'Open',
        recordIds: [...sampleScenarios.ambiguous.invoiceIds],
      },
    },
    { TrendChart: { currency: 'USD', months: 6 } },
    { AgingSummary: { currency: 'GBP', customerId: 'thistle' } },
    { CustomerCard: { customerId: 'atlas' } },
    { ReviewPayment: { paymentId: sampleScenarios.ambiguous.paymentId } },
  ],
};

test('a valid answer becomes one AssistantText node with canonical children', () => {
  expect(validateUi(snapshot, full)).toEqual({
    ui: [
      {
        AssistantText: {
          props: { text: 'Atlas has two open invoices.' },
          children: [
            {
              LedgerTable: {
                props: {
                  title: 'Open',
                  recordIds: [...sampleScenarios.ambiguous.invoiceIds],
                },
              },
            },
            {
              TrendChart: {
                props: { currency: 'USD', customerId: null, months: 6 },
              },
            },
            {
              AgingSummary: {
                props: { currency: 'GBP', customerId: 'thistle' },
              },
            },
            { CustomerCard: { props: { customerId: 'atlas' } } },
            {
              ReviewPayment: {
                props: { paymentId: sampleScenarios.ambiguous.paymentId },
              },
            },
          ],
        },
      },
    ],
  });
  expect(validateUi(snapshot, { text: 'Nothing else.' })).toEqual({
    ui: [{ AssistantText: { props: { text: 'Nothing else.' }, children: [] } }],
  });
});

test('the canonical tree satisfies the kit schema the client renders', () => {
  const kit = ɵcreateUiKit({
    components: createAssistantKit({
      AssistantText: {},
      LedgerTable: {},
      TrendChart: {},
      AgingSummary: {},
      CustomerCard: {},
      ReviewPayment: {},
    }),
  });

  expect(() => kit.schema.validate(validateUi(snapshot, full))).not.toThrow();
  expect(() =>
    kit.schema.validate(validateUi(snapshot, { text: 'Hi' })),
  ).not.toThrow();
});

test.each([
  [{ text: '' }, 'invalid_ui: text is empty'],
  [
    { text: 'x', components: [{ Bogus: {} }] },
    'invalid_ui: unknown component Bogus',
  ],
  [
    { text: 'x', components: [{ LedgerTable: { title: 't', recordIds: [] } }] },
    'invalid_ui: LedgerTable.recordIds must have 1 to 50 ids',
  ],
  [
    {
      text: 'x',
      components: [{ LedgerTable: { title: 't', recordIds: ['nope'] } }],
    },
    'invalid_ui: unknown record nope',
  ],
  [
    {
      text: 'x',
      components: [
        {
          LedgerTable: {
            title: 't',
            recordIds: ['invoice-cedar-partial', 'invoice-cedar-partial'],
          },
        },
      ],
    },
    'invalid_ui: duplicate record invoice-cedar-partial',
  ],
  [
    {
      text: 'x',
      components: [
        { LedgerTable: { title: ' ', recordIds: ['invoice-cedar-partial'] } },
      ],
    },
    'invalid_ui: LedgerTable.title is empty',
  ],
  [
    { text: 'x', components: [{ TrendChart: { currency: 'JPY', months: 6 } }] },
    'invalid_ui: unknown currency JPY',
  ],
  [
    {
      text: 'x',
      components: [
        { TrendChart: { currency: 'USD', customerId: 'nobody', months: 6 } },
      ],
    },
    'invalid_ui: unknown customer nobody',
  ],
  [
    { text: 'x', components: [{ TrendChart: { currency: 'USD', months: 2 } }] },
    'invalid_ui: TrendChart.months must be 3 to 24',
  ],
  [
    {
      text: 'x',
      components: [{ AgingSummary: { currency: 'USD', customerId: 'lumen' } }],
    },
    'invalid_ui: customer lumen is not billed in USD',
  ],
  [
    { text: 'x', components: [{ CustomerCard: { customerId: 'nobody' } }] },
    'invalid_ui: unknown customer nobody',
  ],
  [
    {
      text: 'x',
      components: [
        { ReviewPayment: { paymentId: 'payment-northstar-2024-10' } },
      ],
    },
    'invalid_ui: payment payment-northstar-2024-10 has no unapplied balance',
  ],
  [
    { text: 'x', components: [{ ReviewPayment: { paymentId: 'nope' } }] },
    'invalid_ui: unknown payment nope',
  ],
] as [unknown, string][])('rejects %j', (input, message) => {
  expect(() => validateUi(snapshot, input as AssistantRenderInput)).toThrow(
    message,
  );
});

test('rejects more than 20 components', () => {
  const components = Array.from({ length: 21 }, () => ({
    CustomerCard: { customerId: 'atlas' },
  }));

  expect(() => validateUi(snapshot, { text: 'x', components })).toThrow(
    'invalid_ui: too many components',
  );
});

test('renderUi streams the canonical tree through the echo and retries once on drift', async () => {
  const tree = validateUi(snapshot, { text: 'Hello' });
  const calls: unknown[] = [];
  let first = true;
  const echo = async (schema: unknown, canonical: unknown) => {
    calls.push(schema);
    if (first) {
      first = false;
      return { ui: [] };
    }
    return canonical;
  };

  await expect(renderUi(tree, { schema: 's' }, echo)).resolves.toEqual({
    rendered: true,
  });
  expect(calls).toEqual([{ schema: 's' }, { schema: 's' }]);
  await expect(
    renderUi(tree, { schema: 's' }, async () => ({ ui: [] })),
  ).rejects.toThrow('invalid_assistant_ui');
});
