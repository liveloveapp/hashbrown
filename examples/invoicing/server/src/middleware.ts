import { allow, defineMiddleware, reject } from '@b4run/sdk';
import { getServices } from './services';

/** Errors the ownership guard raises about the request itself, rather than about storage. */
const guardErrors = [
  'invalid_thread',
  'thread_binding_conflict',
  'stale_generation',
];

/** Session-scoped authorization for the assistant and review routes. */
export default defineMiddleware(async (request) => {
  const { assistant, review, claimThread } = await getServices();
  const result =
    request.routeId === '/assistant'
      ? await assistant(request)
      : await review(request);
  if (result.action !== 'continue') return reject(result.status, result.body);
  try {
    await claimThread(request.headers, request.routeId, request.body);
  } catch (error) {
    if (error instanceof Error && guardErrors.includes(error.message))
      return reject(422, { error: 'invalid_thread' });
    throw error;
  }
  return allow(result.context);
});
