import { z } from 'zod';

const FulfillmentTemplateInputSchema = z
  .object({ context: z.literal('unstuck') })
  .strict();

/** Input for {@link renderFulfillmentTemplate}. */
export type FulfillmentTemplateInput = z.infer<
  typeof FulfillmentTemplateInputSchema
>;

/** A recipient message; the job handler adds the greeting and signature. */
export interface RecipientTemplate {
  readonly subject: string;
  readonly body: string;
}

/**
 * Renders the acknowledgement sent after a "Get unstuck" submission. Any
 * context other than `unstuck` throws.
 */
export function renderFulfillmentTemplate(
  candidate: unknown,
): RecipientTemplate {
  FulfillmentTemplateInputSchema.parse(candidate);
  return {
    subject: 'Got your note',
    body: "Thanks for writing. I read every one of these myself and I'll reply with something useful, usually within a business day.\n\nIf it helps in the meantime, the docs for the part you're on are at\nhttps://hashbrown.dev/docs.",
  };
}
