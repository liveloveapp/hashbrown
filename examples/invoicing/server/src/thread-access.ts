import { createHash } from 'node:crypto';
import { defineThreadAccess, deny, permit } from '@b4run/sdk';
import { readSessionCookie } from './session-cookie';
import { getServices } from './services';

/**
 * Who a thread belongs to, decided by B4.run rather than by this app.
 *
 * The stamp returned from `create` is stored under a reserved key the client
 * cannot write and handed back as `thread.access` on every later request, which
 * is the property the app's own binding table had to enforce by hand. Because
 * the policy gates `/threads/*` as well as `POST /agui/:routeId`, it also covers
 * the endpoints the app's middleware never saw.
 *
 * The stamp records the generation the thread was created in, and every later
 * request compares it against the session's current generation: resetting the
 * ledger leaves earlier threads behind rather than letting them keep talking
 * about a ledger that no longer exists.
 */

/** The route a run request names: `/agui/%2Fassistant%23agent` → `/assistant`. */
function routeIdOf(url: string): string | undefined {
  const match = /^\/agui\/([^/?]+)/.exec(url);
  if (!match) return undefined;
  return decodeURIComponent(match[1]).split('#')[0];
}

interface Caller {
  /**
   * The session cookie is this app's bearer credential, and a stamp is handed
   * back in the body of `GET /threads/:id`. Stamping a digest keeps the
   * comparison exact without putting the credential itself somewhere it can be
   * read back, logged, or copied out of a response.
   */
  readonly sessionId: string;
  readonly generation: number;
}

const digest = (sessionId: string) =>
  createHash('sha256').update(sessionId).digest('hex');

async function caller(
  headers: Readonly<Record<string, string>>,
): Promise<Caller | undefined> {
  const sessionId = readSessionCookie(headers.cookie);
  if (!sessionId) return undefined;
  try {
    const { store } = await getServices();
    return {
      sessionId: digest(sessionId),
      generation: await store.generation(sessionId),
    };
  } catch {
    return undefined;
  }
}

export default defineThreadAccess({
  /** A thread that did not exist a moment ago belongs to the session opening it. */
  async create(request) {
    const who = await caller(request.headers);
    if (!who) return deny();
    const routeId = routeIdOf(request.url);
    return permit(routeId ? { ...who, routeId } : { ...who });
  },

  /** Every other action answers to the stamp that create returned. */
  async fallback(request) {
    const who = await caller(request.headers);
    if (!who) return deny();
    const access = request.thread?.access;
    if (
      !access ||
      access.sessionId !== who.sessionId ||
      access.generation !== who.generation
    )
      return deny();
    const routeId = routeIdOf(request.url);
    if (routeId !== undefined && access.routeId !== routeId) return deny();
    return permit();
  },
});
