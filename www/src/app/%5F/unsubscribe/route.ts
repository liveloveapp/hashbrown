import { createUnsubscribeRoute } from './handler';

const route = createUnsubscribeRoute();

/** GET /_/unsubscribe. */
export const GET = route.GET;
/** POST /_/unsubscribe. */
export const POST = route.POST;
