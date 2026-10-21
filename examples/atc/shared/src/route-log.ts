import { decisionView, type RouterShown } from './stream-view';

/** The most route sends the log keeps by default. */
const ROUTE_LOG_MAX = 10;

/** The longest sent text a one-line entry shows before it is cut with `…`. */
const LINE_TEXT_MAX = 48;

/**
 * One submission and where it went: typed text routed by the router, or a
 * starter or refinement, which skip it and name their own route.
 */
export interface RouteSend {
  /** The text that was sent. */
  readonly text: string;
  /** What the router did for it (skipped for starters and refinements). */
  readonly router: RouterShown;
  /** The route actually taken. */
  readonly outcome: 'filter' | 'clear' | 'chat';
}

/**
 * Adds `send` to the log: newest first, at most `max` entries (the oldest go).
 * The log given is not changed.
 */
export function recordRoute(
  log: readonly RouteSend[],
  send: RouteSend,
  max = ROUTE_LOG_MAX,
): readonly RouteSend[] {
  return [send, ...log].slice(0, Math.max(0, max));
}

/** The sent text in quotes, cut with `…` past {@link LINE_TEXT_MAX} characters. */
export function quotedSend(text: string): string {
  return text.length > LINE_TEXT_MAX
    ? `"${text.slice(0, LINE_TEXT_MAX - 1)}…"`
    : `"${text}"`;
}

/**
 * A send as one line: `"jets" → filter (starter)`, or with the probability
 * the router gave its intent, `"busiest airport?" → chat 0.91`. A fallback
 * gives its reason: `"hi" → chat (too short)`.
 */
export function routeLine(send: RouteSend): string {
  const head = `${quotedSend(send.text)} → ${send.outcome}`;
  const router = send.router;
  if (router.kind !== 'decided') return `${head} (${router.reason})`;
  const intent = decisionView(router.result, null).find(
    (row) => row.key === 'intent',
  );

  return intent?.probability === null || intent === undefined
    ? head
    : `${head} ${intent.probability.toFixed(2)}`;
}
