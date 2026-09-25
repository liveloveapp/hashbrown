import { expect, test } from 'vitest';
import { ɵcreateUiKit } from '@hashbrownai/core';
import {
  type AssistantRenderInput,
  createAssistantKit,
} from '@invoicing/contracts';
import { getSnapshot } from './ledger';
import { createSampleLedger, sampleScenarios } from './sample-ledger';
import { validateUi } from './assistant-ui';

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
                props: {
                  paymentId: sampleScenarios.ambiguous.paymentId,
                  invoiceId: null,
                },
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
    { text: 'x'.repeat(4001) },
    'invalid_ui: text is longer than 4000 characters',
  ],
  [
    {
      text: {
        toString() {
          return 'x';
        },
      },
    },
    'invalid_ui: text is empty',
  ],
  [
    { text: 'x', components: 'nope' },
    'invalid_ui: components must be an array',
  ],
  [
    { text: 'x', components: [[{ CustomerCard: { customerId: 'atlas' } }]] },
    'invalid_ui: components[0]: each component must have exactly one component key',
  ],
  [
    { text: 'x', components: [{ Bogus: {} }] },
    'invalid_ui: components[0].Bogus: unknown component Bogus',
  ],
  [
    { text: 'x', components: [JSON.parse('{"__proto__":{}}')] },
    'invalid_ui: components[0].__proto__: unknown component __proto__',
  ],
  [
    { text: 'x', components: [{ constructor: {} }] },
    'invalid_ui: components[0].constructor: unknown component constructor',
  ],
  [
    { text: 'x', components: [{ LedgerTable: { title: 't', recordIds: [] } }] },
    'invalid_ui: components[0].LedgerTable.recordIds must have 1 to 50 ids',
  ],
  [
    {
      text: 'x',
      components: [{ LedgerTable: { title: 't', recordIds: ['nope'] } }],
    },
    'invalid_ui: components[0].LedgerTable.recordIds: unknown record nope',
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
    'invalid_ui: components[0].LedgerTable.recordIds: duplicate record invoice-cedar-partial',
  ],
  [
    {
      text: 'x',
      components: [
        { LedgerTable: { title: ' ', recordIds: ['invoice-cedar-partial'] } },
      ],
    },
    'invalid_ui: components[0].LedgerTable.title is empty',
  ],
  [
    {
      text: 'x',
      components: [
        {
          LedgerTable: {
            title: 't'.repeat(121),
            recordIds: ['invoice-cedar-partial'],
          },
        },
      ],
    },
    'invalid_ui: components[0].LedgerTable.title is longer than 120 characters',
  ],
  [
    { text: 'x', components: [{ TrendChart: { currency: 'JPY', months: 6 } }] },
    'invalid_ui: components[0].TrendChart.currency: unknown currency JPY',
  ],
  [
    { text: 'x', components: [{ TrendChart: { months: 6 } }] },
    'invalid_ui: components[0].TrendChart.currency: unknown currency undefined',
  ],
  [
    {
      text: 'x',
      components: [
        { TrendChart: { currency: 'USD', customerId: 'nobody', months: 6 } },
      ],
    },
    'invalid_ui: components[0].TrendChart.customerId: unknown customer nobody',
  ],
  [
    {
      text: 'x',
      components: [
        { TrendChart: { currency: 'USD', customerId: 'lumen', months: 6 } },
      ],
    },
    'invalid_ui: components[0].TrendChart.customerId: customer lumen is billed in EUR, not USD',
  ],
  [
    { text: 'x', components: [{ TrendChart: { currency: 'USD', months: 2 } }] },
    'invalid_ui: components[0].TrendChart.months must be a whole number from 3 to 24',
  ],
  [
    {
      text: 'x',
      components: [{ TrendChart: { currency: 'USD', months: 6.5 } }],
    },
    'invalid_ui: components[0].TrendChart.months must be a whole number from 3 to 24',
  ],
  [
    {
      text: 'x',
      components: [{ AgingSummary: { currency: 'USD', customerId: 'lumen' } }],
    },
    'invalid_ui: components[0].AgingSummary.customerId: customer lumen is billed in EUR, not USD',
  ],
  [
    {
      text: 'x',
      components: [
        { CustomerCard: { customerId: 'atlas' } },
        { CustomerCard: { customerId: 'atlas' } },
        { CustomerCard: { customerId: 'nobody' } },
      ],
    },
    'invalid_ui: components[2].CustomerCard.customerId: unknown customer nobody',
  ],
  [
    {
      text: 'x',
      components: [
        { ReviewPayment: { paymentId: 'payment-northstar-2024-10' } },
      ],
    },
    'invalid_ui: components[0].ReviewPayment.paymentId: payment payment-northstar-2024-10 has no unapplied balance',
  ],
  [
    { text: 'x', components: [{ ReviewPayment: { paymentId: 'nope' } }] },
    'invalid_ui: components[0].ReviewPayment.paymentId: unknown payment nope',
  ],
] as [unknown, string][])('rejects %j', (input, message) => {
  expect(() => validateUi(snapshot, input as AssistantRenderInput)).toThrow(
    message,
  );
});

const harborPaidInvoiceId = snapshot.invoices.find(
  (invoice) =>
    invoice.customerId === 'harbor' && invoice.outstandingCents === 0,
)?.id;

test('ReviewPayment keeps an invoice that the payment can settle', () => {
  const input: AssistantRenderInput = {
    text: 'Harbor paid two invoices at once.',
    components: [
      {
        ReviewPayment: {
          paymentId: sampleScenarios.combined.paymentId,
          invoiceId: sampleScenarios.combined.invoiceIds[0],
        },
      },
    ],
  };

  const result = validateUi(snapshot, input);

  expect(result.ui).toEqual([
    {
      AssistantText: {
        props: { text: 'Harbor paid two invoices at once.' },
        children: [
          {
            ReviewPayment: {
              props: {
                paymentId: sampleScenarios.combined.paymentId,
                invoiceId: sampleScenarios.combined.invoiceIds[0],
              },
            },
          },
        ],
      },
    },
  ]);
});

test.each([
  [
    'nope',
    'invalid_ui: components[0].ReviewPayment.invoiceId: unknown invoice nope',
  ],
  [
    sampleScenarios.ambiguous.invoiceIds[0],
    `invalid_ui: components[0].ReviewPayment.invoiceId: invoice ${sampleScenarios.ambiguous.invoiceIds[0]} is not for this payment's customer and currency`,
  ],
  [
    harborPaidInvoiceId,
    `invalid_ui: components[0].ReviewPayment.invoiceId: invoice ${harborPaidInvoiceId} has no outstanding balance`,
  ],
])('ReviewPayment rejects invoice %s', (invoiceId, message) => {
  const input = {
    text: 'x',
    components: [
      {
        ReviewPayment: {
          paymentId: sampleScenarios.combined.paymentId,
          invoiceId,
        },
      },
    ],
  };

  const act = () => validateUi(snapshot, input as AssistantRenderInput);

  expect(act).toThrow(message);
});

test('extra keys inside a leaf are stripped', () => {
  const input = {
    text: 'x',
    components: [{ CustomerCard: { customerId: 'atlas', evil: 1, props: {} } }],
  };

  expect(validateUi(snapshot, input as AssistantRenderInput).ui).toEqual([
    {
      AssistantText: {
        props: { text: 'x' },
        children: [{ CustomerCard: { props: { customerId: 'atlas' } } }],
      },
    },
  ]);
});

test('text is trimmed before it becomes the AssistantText prop', () => {
  expect(validateUi(snapshot, { text: '  Hi \n' }).ui).toEqual([
    { AssistantText: { props: { text: 'Hi' }, children: [] } },
  ]);
});

test('rejects more than 20 components', () => {
  const components = Array.from({ length: 21 }, () => ({
    CustomerCard: { customerId: 'atlas' },
  }));

  expect(() => validateUi(snapshot, { text: 'x', components })).toThrow(
    'invalid_ui: too many components',
  );
});
