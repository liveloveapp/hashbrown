import { createInboxRecoveryRoute } from './handler';

/** Allow bounded receiving recovery and durable notification on a supported Vercel plan. */
export const maxDuration = 300;

/** GET /_/cron/inbox-recovery. */
export const { GET } = createInboxRecoveryRoute();
