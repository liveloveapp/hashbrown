import { createResendWebhookRoute } from './handler';

/** POST /_/webhooks/resend. */
export const { POST } = createResendWebhookRoute();
