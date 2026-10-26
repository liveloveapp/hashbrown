import { deny, ownedThreads, type ThreadAccessPolicy } from '@b4run/sdk';

/** Maximum age of an anonymous conversation; expired threads cannot resume. */
export const THREAD_LIFETIME_MS = 86_400_000;

/** Applies anonymous ownership and a fixed 24-hour admission window. */
export function createAtcThreadPolicy(
  now: () => number = Date.now,
): ThreadAccessPolicy {
  const owned = ownedThreads();
  return {
    ...owned,
    fallback(request) {
      const created = request.thread && Date.parse(request.thread.created_at);
      if (
        created !== undefined &&
        (!Number.isFinite(created) || now() - created >= THREAD_LIFETIME_MS)
      ) {
        return deny({ status: 404 });
      }
      return owned.fallback(request);
    },
  };
}
