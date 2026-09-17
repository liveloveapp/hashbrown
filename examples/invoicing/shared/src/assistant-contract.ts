import { s, ɵcreateUiKit } from '@hashbrownai/core';

/** Plain text answers rendered without HTML or executable model content. */
export const assistantTextConfig = {
  name: 'AssistantText',
  description: 'A plain text answer grounded in the ledger.',
  children: false,
  props: { text: s.string('Answer text') },
} as const;

/** An explicit user action that opens a separately authorized payment review. */
export const reviewPaymentConfig = {
  name: 'ReviewPayment',
  description: 'Offer to review one existing unapplied payment.',
  children: false,
  props: { paymentId: s.string('The exact existing payment ID') },
} as const;

/** Canonical schema for read-only assistant responses and review suggestions. */
export const assistantResponseSchema: Record<string, unknown> = s.toJsonSchema(
  ɵcreateUiKit({
    components: [
      { ...assistantTextConfig, component: {} },
      { ...reviewPaymentConfig, component: {} },
    ],
  }).schema,
);
