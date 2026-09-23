// Lives outside `app/assistant/tools`, which B4 scans for tool modules.
import { expect, test } from 'vitest';
import type { B4ToolContext } from '@b4run/sdk';
import { assistantContext } from './assistant-middleware';
import { getSnapshot } from './ledger';
import { createSampleLedger, sampleScenarios } from './sample-ledger';
import render from './app/assistant/tools/render';

const snapshot = getSnapshot(createSampleLedger());

function contextFor() {
  const middleware = assistantContext(() => Promise.resolve(snapshot));
  return {
    context: { middleware } as unknown as B4ToolContext,
    rendered: middleware.rendered,
  };
}

test('render validates the tree, marks the run as rendered and returns without a model', async () => {
  const { context, rendered } = contextFor();
  const payment = snapshot.payments.find(
    (p) => p.id === sampleScenarios.exact.paymentId,
  );

  const result = await render(
    {
      text: 'One payment is waiting.',
      components: [{ ReviewPayment: { paymentId: payment?.id ?? '' } }],
    },
    context,
  );

  expect(result).toEqual({ rendered: true });
  expect(rendered.ui).toBe(true);
});

test('render rejects an unknown ID with invalid_ui and leaves the run unrendered', async () => {
  const { context, rendered } = contextFor();

  await expect(
    render(
      {
        text: 'x',
        components: [{ CustomerCard: { customerId: 'nobody' } }],
      },
      context,
    ),
  ).rejects.toThrow('invalid_ui: components[0].CustomerCard.customerId');
  expect(rendered.ui).toBe(false);
});
