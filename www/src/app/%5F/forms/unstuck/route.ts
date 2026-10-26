import { createUnstuckRoute } from './handler';

/** Always evaluated per request. */
export const dynamic = 'force-dynamic';

/** POST /_/forms/unstuck. */
export const POST = createUnstuckRoute().POST;
