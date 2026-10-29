import { z } from 'zod';

/**
 * The dispatch route's thread state: what triggered the tick and, once it
 * has run, how many posts it leased, published, failed and held.
 */
const state = z
  .object({
    trigger: z.literal('cron'),
    result: z
      .object({
        leased: z.number().int().nonnegative(),
        published: z.number().int().nonnegative(),
        failed: z.number().int().nonnegative(),
        held: z.number().int().nonnegative(),
        operatorAlerts: z.array(
          z.enum(['post_failed', 'blog_not_live', 'credential_expiring']),
        ),
      })
      .strict()
      .optional(),
  })
  .strict();

export default state;

/** The inferred dispatch state. */
export type DispatchState = z.infer<typeof state>;
