import {
  cardPicks,
  type DecisionResultLike,
  routeAction,
  type RouteAction,
  type routeSchema,
} from '@atc/shared';
import type { Decision } from '@hashbrownai/core';

/** Where the router should send a probe: the chat, the filter, or a clear. */
export type RouteKind = RouteAction['kind'];

/** One labelled router probe: what the user types and where it should go. */
export interface RouteProbe {
  readonly input: string;
  readonly expected: RouteKind;
}

/** One labelled cards probe: a question and the card it should be narrowed to. */
export interface CardsProbe {
  readonly input: string;
  readonly expected: string;
}

/**
 * The main router set: every starter, typed chat that names aircraft, places
 * or actions, typed filters and clears. "Show me" plus a place or a
 * superlative is chat; the same set phrased as a restriction is filter.
 */
export const ROUTE_PROBES: readonly RouteProbe[] = [
  { input: "What's flying near Bend?", expected: 'chat' },
  { input: 'Show me everything landing at Seattle.', expected: 'chat' },
  {
    input: "What's the highest plane right now? And the fastest?",
    expected: 'chat',
  },
  { input: 'Follow the fastest airliner.', expected: 'chat' },
  { input: 'Show me Redmond airport.', expected: 'chat' },
  { input: 'Which planes are inside the Portland Class C?', expected: 'chat' },
  { input: 'Only jets below 10,000 ft', expected: 'filter' },
  { input: "What's the plane I selected?", expected: 'chat' },
  { input: 'Follow N484SJ', expected: 'chat' },
  { input: 'Compare the two fastest jets', expected: 'chat' },
  { input: 'Highlight the Alaska flights near Portland', expected: 'chat' },
  { input: 'Why is that plane circling?', expected: 'chat' },
  { input: 'Show me the lowest helicopter', expected: 'chat' },
  { input: 'What runways does Bend have?', expected: 'chat' },
  { input: 'Show me Portland airspace', expected: 'chat' },
  { input: 'Show me arrivals at Portland', expected: 'chat' },
  { input: 'How many planes are over Seattle?', expected: 'chat' },
  { input: 'stop following', expected: 'chat' },
  { input: 'only jets', expected: 'filter' },
  { input: 'below 10,000 ft', expected: 'filter' },
  { input: 'Alaska flights near Seattle', expected: 'filter' },
  { input: 'just helicopters', expected: 'filter' },
  { input: 'hide private planes', expected: 'filter' },
  { input: 'Only Boeing 737s', expected: 'filter' },
  { input: 'Only show planes above 30,000 feet', expected: 'filter' },
  { input: 'only aircraft near Bend', expected: 'filter' },
  { input: 'Delta', expected: 'filter' },
  { input: 'clear the filter', expected: 'clear' },
  { input: 'show everything', expected: 'clear' },
  { input: 'remove the filter', expected: 'clear' },
];

/**
 * Router phrasings that no context was tuned on, to catch a context that only
 * learned the main set's wording.
 */
export const HELD_OUT_ROUTE_PROBES: readonly RouteProbe[] = [
  { input: 'Where is Alaska 123 headed?', expected: 'chat' },
  { input: 'Track the Horizon flight into Pasco', expected: 'chat' },
  { input: 'show me the slowest plane', expected: 'chat' },
  { input: 'Which jet is closest to Boeing Field?', expected: 'chat' },
  { input: 'Show me planes approaching Portland', expected: 'chat' },
  { input: "Show me Seattle's Class B", expected: 'chat' },
  { input: 'Tell me about the helicopter over Tacoma', expected: 'chat' },
  { input: "Is anything in Bend's airspace?", expected: 'chat' },
  { input: 'Compare Alaska 5 and Delta 12', expected: 'chat' },
  { input: 'no helicopters', expected: 'filter' },
  { input: 'only Horizon', expected: 'filter' },
  { input: 'planes above FL300', expected: 'filter' },
  { input: 'just the 737s near Portland', expected: 'filter' },
  { input: 'turboprops only', expected: 'filter' },
  { input: 'only show Southwest and Alaska', expected: 'filter' },
  { input: 'reset the filter', expected: 'clear' },
  { input: 'show all planes again', expected: 'clear' },
];

/** Every chat starter and two typed questions, with the card each should get. */
export const CARDS_PROBES: readonly CardsProbe[] = [
  {
    input: "What's the highest plane right now? And the fastest?",
    expected: 'AircraftCompare',
  },
  { input: "What's flying near Bend?", expected: 'ArrivalsBoard' },
  {
    input: 'Show me everything landing at Seattle.',
    expected: 'ArrivalsBoard',
  },
  { input: 'Follow the fastest airliner.', expected: 'FlightCard' },
  { input: 'Show me Redmond airport.', expected: 'AirportCard' },
  {
    input: 'Which planes are inside the Portland Class C?',
    expected: 'ArrivalsBoard',
  },
  { input: "What's the plane I selected?", expected: 'FlightCard' },
  { input: 'Compare the two fastest jets', expected: 'AircraftCompare' },
];

/** The minimum correct answers per set; below any of them the eval fails. */
export const DECIDE_EVAL_THRESHOLDS = {
  route: 28,
  heldOut: 16,
  cards: 7,
} as const;

/** How one router probe came out. */
export interface RouteOutcome extends RouteProbe {
  readonly got: RouteKind;
  readonly ok: boolean;
  /** The intent and its confidence, such as `chat 0.98`. */
  readonly detail: string;
}

/**
 * Scores a router decision the way Enter would act on it: an unsure or
 * `other` decision goes to chat, as in the apps.
 */
export function scoreRoute(
  probe: RouteProbe,
  result: Decision.Result<typeof routeSchema>,
): RouteOutcome {
  const got = routeAction(result).kind;

  return {
    ...probe,
    got,
    ok: got === probe.expected,
    detail: `${result.value.intent} ${result.meta.intent.confidence.toFixed(2)}, clear ${result.meta.clear.probability.toFixed(2)}`,
  };
}

/** How one cards probe came out. */
export interface CardsOutcome extends CardsProbe {
  /** The cards the chat would send, or every card when not confident. */
  readonly sent: readonly string[] | 'all';
  readonly ok: boolean;
}

/**
 * Scores a cards decision: correct only when it is confident (so the chat
 * narrows) and the best pick is the expected card.
 */
export function scoreCards(
  probe: CardsProbe,
  result: DecisionResultLike,
): CardsOutcome {
  const { picks, confident } = cardPicks(result);

  return {
    ...probe,
    sent: confident ? picks : 'all',
    ok: confident && picks[0] === probe.expected,
  };
}

/** The number of outcomes that came out right. */
export function correctCount(outcomes: readonly { ok: boolean }[]): number {
  return outcomes.filter((outcome) => outcome.ok).length;
}
