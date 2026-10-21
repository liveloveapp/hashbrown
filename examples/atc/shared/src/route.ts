import type { Decision } from '@hashbrownai/core';
import type { routeSchema } from './contracts';

type RouteResult = Decision.Result<typeof routeSchema>;

/** Below this intent confidence, typed text goes to chat. */
const CONFIDENCE_THRESHOLD = 0.7;

/** At or above this probability, a filter intent also clears the filter. */
const CLEAR_THRESHOLD = 0.5;

/** Where Enter sends what the user typed. */
export type RouteAction =
  { kind: 'filter' } | { kind: 'clear' } | { kind: 'chat' };

/**
 * Decides what Enter does. A missing decision, an `other` intent, or an intent
 * below 0.7 confidence goes to chat. A `filter` intent applies the filter, or
 * clears it instantly when the `clear` answer is at least 0.5 probable.
 */
export function routeAction(result: RouteResult | null): RouteAction {
  if (
    result === null ||
    result.value.intent === 'other' ||
    result.meta.intent.confidence < CONFIDENCE_THRESHOLD
  ) {
    return { kind: 'chat' };
  }
  if (result.value.intent === 'chat') return { kind: 'chat' };
  return result.meta.clear.probability >= CLEAR_THRESHOLD
    ? { kind: 'clear' }
    : { kind: 'filter' };
}

/** The router badge shown beside the input. */
export interface RouteBadge {
  label: string;
  tone: 'filter' | 'chat' | 'unsure' | 'idle';
}

/**
 * The badge for the latest decision, for example `→ filter 0.97`. Below 0.7
 * confidence, or for `other`, the tone is `unsure` (drawn dashed) because Enter
 * goes to chat. With no decision the badge is `idle` with an empty label.
 * While a new decision is pending the last result stays shown, so the badge
 * does not flicker between keystrokes; before any result it is idle. When the
 * decision `failed` (no key, no network) the badge is a plain `→ chat`: Enter
 * goes to chat and nothing reports an error.
 */
export function routeBadge(
  result: RouteResult | null,
  // Pending keeps the last result on purpose: the badge never blanks mid-typing.
  pending: boolean,
  failed = false,
): RouteBadge {
  void pending;
  if (result === null) {
    return failed
      ? { label: '→ chat', tone: 'chat' }
      : { label: '', tone: 'idle' };
  }
  const { intent } = result.value;
  const confidence = result.meta.intent.confidence;
  const label = `→ ${intent} ${confidence.toFixed(2)}`;
  const unsure = intent === 'other' || confidence < CONFIDENCE_THRESHOLD;
  return { label, tone: unsure ? 'unsure' : intent };
}
