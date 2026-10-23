import { createFounderStopRoute } from './handler';

const route = createFounderStopRoute();

/** GET /_/growth/stop. */
export const GET = route.GET;
/** POST /_/growth/stop. */
export const POST = route.POST;
