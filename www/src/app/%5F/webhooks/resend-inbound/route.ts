import { createResendInboundRoute } from './handler';

/** POST /_/webhooks/resend-inbound. */
export const { POST } = createResendInboundRoute();
