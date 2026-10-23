import { createFounderApproveInstallRoute } from './handler';

const route = createFounderApproveInstallRoute();

/** GET /_/growth/approve-install. */
export const GET = route.GET;
/** POST /_/growth/approve-install. */
export const POST = route.POST;
