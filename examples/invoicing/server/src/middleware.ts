import { allow, defineMiddleware, reject } from '@b4run/sdk';
import { validatedUi, validateFinalAnswer } from './assistant-middleware';
import { createRunTimer, runTimerOf, timeContext } from './run-timing';
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
    // Time every tool call of the run, so slow answers can be traced to a
    // step or to the model turns between steps (see run-timing.ts).
    const body = request.body as { readonly runId?: unknown } | undefined;
    // The run id is client-supplied: cap what reaches the logs.
    const runId =
      typeof body?.runId === 'string' ? body.runId.slice(0, 256) : 'unknown';
    return allow(
      timeContext(result.context, createRunTimer(request.routeId, runId)),
    );
  },
  /**
   * The assistant answers by calling `render`; the browser renders that call
   * from its own streamed arguments once the server has validated it, so the
   * root model's own final message is redundant. B4 applies the client's
   * `hashbrown.responseSchema` to that message in production, so left alone
   * it could carry real-looking components that never passed the ledger-ID
   * checks in `validateUi`. Suppress it when the run validated UI. When it
   * did not, the model may still have answered in that schema directly (on a
   * follow-up it can answer from earlier tool results without calling
   * `render`): such an answer goes through `validateUi` like a render call
   * and its canonical tree is released instead. Anything else ends the run
   * with a `RUN_ERROR` (no answer at all, or `render` failed and the model
   * gave up) so the client shows its "could not finish" alert rather than
   * nothing at all. The review route has no final
   * message on apply or decline, because `returnDirect` ends the run; the
   * hook returns `undefined` for it.
   *
   * Defining this hook at all buffers every route's final assistant message
   * instead of streaming it token by token, because B4 binds `after` once per
   * middleware rather than per route. That costs nothing on either route
   * here: the assistant's message is dropped or released whole, and the review run has no
   * closing message to stream.
   */
  after: async (run) => {
    if (run.routeId !== '/assistant') {
      runTimerOf(run.context)?.done();
      return undefined;
    }
    const answer = validatedUi(run.context)
      ? ''
      : await validateFinalAnswer(run.context, run.finalMessage);
    runTimerOf(run.context)?.done();
    return answer === undefined
      ? reject(502, { error: 'no_answer' })
      : { finalMessage: answer };
  },
});
