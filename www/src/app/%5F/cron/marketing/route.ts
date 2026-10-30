import { createMarketingCronRoute } from './handler';

/** Always evaluated per request; a cron tick is never cached. */
export const dynamic = 'force-dynamic';

/** Seconds the route may run: a marketing dispatch may take up to 60 s. */
export const maxDuration = 60;

/** GET /_/cron/marketing. */
export const GET = createMarketingCronRoute();
