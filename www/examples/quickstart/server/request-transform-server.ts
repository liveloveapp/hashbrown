import { createRequestTransformApp } from './request-transform-app';

const apiKey = process.env['OPENAI_API_KEY'];
const model = process.env['OPENAI_MODEL'];
const origin = process.env['APP_ORIGIN'];
if (!apiKey || !model || !origin)
  throw new Error('Set OPENAI_API_KEY, OPENAI_MODEL and APP_ORIGIN in .env');

// Local public-data example only: every request uses the same demo identity.
// Replace both integrations with verified sessions and an authorized workspace
// lookup, and add shared request limits before hosting or using customer data.
const app = createRequestTransformApp({
  apiKey,
  model,
  origin,
  authenticate: async () => ({
    userId: 'public-demo',
    workspaceId: 'northstar',
  }),
  loadContext: async (identity) =>
    identity.workspaceId === 'northstar'
      ? {
          workspace: 'Northstar',
          plan: 'Studio',
          responseTime: 'one business day',
        }
      : null,
});

app.listen(3001, '127.0.0.1', () => {
  console.log(
    'Hashbrown support endpoint: http://127.0.0.1:3001/api/transformed-chat',
  );
});
