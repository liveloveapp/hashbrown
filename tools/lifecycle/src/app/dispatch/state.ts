import { z } from 'zod';

/**
 * The dispatch route's thread state: what triggered the tick and, once it
 * has run, the dispatcher's result.
 */
const state = z
  .object({
    trigger: z.enum(['cron', 'nudge']),
    submission_id: z.uuid().optional(),
    dogfood_fixture_marker: z
      .literal('hashbrown-preview-dogfood-v1')
      .optional(),
    result: z
      .object({
        leased: z.number().int().nonnegative(),
        dispatched: z.number().int().nonnegative(),
        recoveryPaused: z.boolean(),
        operatorAlerts: z.array(
          z.enum([
            'mailbox_recovery_required',
            'observation_projection_failed',
          ]),
        ),
      })
      .strict()
      .optional(),
  })
  .strict();

export default state;

/** The inferred dispatch state. */
export type DispatchState = z.infer<typeof state>;
