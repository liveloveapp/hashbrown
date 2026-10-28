/** Authoritative safe-case deadline, leaving cleanup inside the unchanged native sixty-second ceiling. */
export const LIVE_CASE_TIMEOUT_MS = 55_000;

/** UI and native phase waits share the authoritative case limit instead of a shorter inner cutoff. */
export const LIVE_ASSERTION_TIMEOUT_MS = LIVE_CASE_TIMEOUT_MS;
