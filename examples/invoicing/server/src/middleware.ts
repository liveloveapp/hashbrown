import { allow, defineMiddleware, reject } from '@b4run/sdk';
import { validatedUi } from './assistant-middleware';
import { getServices } from './services';

/** Errors the ownership guard raises about the request itself, rather than about storage. */
const guardErrors = [
  'invalid_thread',
  'thread_binding_conflict',
  'stale_generation',
];

/** Session-scoped authorization for the assistant and review routes. */
export default defineMiddleware({
  handle: async (request) => {
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
  },
  /**
   * The assistant answers by calling `render`, whose echo of the canonical UI
   * is what streams to the client as the message it shows; the root model's
   * own final message is redundant. B4 applies the client's
   * `hashbrown.responseSchema` to that message in production, so left alone
   * it could carry real-looking components that never passed the ledger-ID
   * checks in `validateUi`. Suppress it when the run validated UI, and end
   * the run with a `RUN_ERROR` when it did not (the model skipped `render`,
   * or gave up after it failed) so the client shows its "could not finish"
   * alert rather than nothing at all. The review route is untouched and
   * keeps streaming its final message.
   *
   * Defining this hook buffers the final assistant message instead of
   * streaming it token by token, which costs nothing here: the message the
   * user reads is the render echo, emitted earlier and still streamed live.
   */
  after: (run) => {
    if (run.routeId !== '/assistant') return undefined;
    return validatedUi(run.context)
      ? { finalMessage: '' }
      : reject(502, { error: 'no_answer' });
  },
});
