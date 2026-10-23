import { createInboxRecoveryRoute } from './handler';

/** Allow a bounded pilot recovery to finish on a supported Vercel plan. */
export const maxDuration = 300;

/** GET /_/cron/inbox-recovery. */
export const { GET } = createInboxRecoveryRoute();
