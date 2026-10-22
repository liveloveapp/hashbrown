import { allow, defineMiddleware, reject } from '@b4run/sdk';

import { hasExactBearerToken } from './service-auth.ts';

/**
 * Gates every b4run execution endpoint behind the lifecycle service bearer.
 * The outer Vercel adapter checks the same secret first; this is the second
 * gate.
 */
export default defineMiddleware((request) =>
  hasExactBearerToken(
    request.headers['authorization'],
    process.env['LIFECYCLE_SERVICE_SECRET'],
  )
    ? allow({ service: 'hashbrown-www' })
    : reject(401, { error: 'Unauthorized' }),
);
