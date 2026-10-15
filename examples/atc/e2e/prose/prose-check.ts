/**
 * Checks for the assistant's answers: words a user should never see, such
 * as a rule echoed back ("Two short sentences."), a component or tool name,
 * an answer that stops on a colon, or a tap that promises something the app
 * does not do; and a map left without the highlight the answer needs. Used
 * by the live prose eval (`prose/eval.ts`).
 */
import { ATC_TOOL_NAMES } from '@atc/shared';

/** What kind of problem a paragraph has. */
export type ProseIssueKind =
  | 'leak'
  | 'internal-name'
  | 'dangling-colon'
  | 'false-tap'
  | 'lead-in'
  | 'extra-cards'
  | 'cleared-highlight'
  | 'no-highlight';

/** One problem, with the paragraph it was found in. */
export interface ProseIssue {
  readonly kind: ProseIssueKind;
  readonly text: string;
}

/** Words from the system prompt's rules that have no place in an answer. */
const LEAK =
  /\b(sentences?|lead-?ins?|prose|em-?dash(es)?|en-?dash(es)?|exclamation|emoji|hex (codes?|fields?)|props?|tool (calls?|results?)|these rules|instructions?|as instructed|label(l?ed)?)\b/i;

/** Component, tool and field names the model sees but users never should. */
const INTERNAL_NAME = new RegExp(
  `\\b(${[
    ...ATC_TOOL_NAMES,
    'FlightCard',
    'ArrivalsBoard',
    'AircraftCompare',
    'AirportCard',
    'partTime',
    'checkedAltitudeFt',
    'altitudeSource',
    'inAirspace',
    'highlightedAirspace',
  ].join('|')})\\b`,
);

/** A paragraph that ends on a colon, with nothing after it. */
const DANGLING_COLON = /:\s*$/;

/** A tap that starts or stops following (only the map's Stop does that). */
const FALSE_TAP = /\btap\b(?! stop\b)[^.]*\b(follow|stop following|unfollow)/i;

/** An opening the prompt rules out: the answer comes first. */
const LEAD_IN =
  /^(here(['’]?s| are| is)|sure|certainly|of course|let me|okay|great)\b/i;

const CHECKS: readonly (readonly [ProseIssueKind, RegExp])[] = [
  ['leak', LEAK],
  ['internal-name', INTERNAL_NAME],
  ['dangling-colon', DANGLING_COLON],
  ['false-tap', FALSE_TAP],
  ['lead-in', LEAD_IN],
];

/**
 * The problems in an answer's prose paragraphs, in paragraph order, at most
 * one per kind per paragraph.
 */
export function proseIssues(paragraphs: readonly string[]): ProseIssue[] {
  return paragraphs.flatMap((text) =>
    CHECKS.filter(([, pattern]) => pattern.test(text)).map(([kind]) => ({
      kind,
      text,
    })),
  );
}

/** What the map showed when an answer finished. */
export interface MapState {
  /** Aircraft the answer's components show (board rows, cards, compares). */
  readonly shown: number;
  /** Aircraft highlighted on the map. */
  readonly highlighted: number;
  /** The model cleared the highlight although the question didn't ask. */
  readonly clearedUnasked: boolean;
}

/**
 * Problems with the map an answer leaves behind: the model cleared its own
 * highlight unasked, or the chat shows aircraft but the map highlights none
 * of them.
 */
export function mapIssues({
  shown,
  highlighted,
  clearedUnasked,
}: MapState): ProseIssue[] {
  if (clearedUnasked) {
    return [
      { kind: 'cleared-highlight', text: 'Cleared the highlight unasked' },
    ];
  }
  return shown > 0 && highlighted === 0
    ? [
        {
          kind: 'no-highlight',
          text: `Showed ${shown} aircraft, highlighted none on the map`,
        },
      ]
    : [];
}

/** How many of each component an answer rendered. */
export interface CardCounts {
  readonly boards: number;
  readonly flightCards: number;
  readonly compares: number;
  readonly airportCards: number;
}

/** "1 board", "2 flight cards". */
function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/**
 * Cards beyond what the prompt asks for: one board for a list, one flight
 * card for one aircraft, one compare for two or three. Reports the first
 * rule broken, so an answer counts once.
 */
export function cardIssues({
  boards,
  flightCards,
  compares,
}: CardCounts): ProseIssue[] {
  const extra = extraCards(boards, flightCards, compares);

  return extra === null ? [] : [{ kind: 'extra-cards', text: extra }];
}

/** What is extra about these counts, or null when they follow the prompt. */
function extraCards(
  boards: number,
  flightCards: number,
  compares: number,
): string | null {
  if (boards > 1) {
    return `Showed ${count(boards, 'board')}`;
  }
  if (boards === 1 && flightCards > 0) {
    return `Showed 1 board and ${count(flightCards, 'flight card')}`;
  }
  if (compares > 0 && flightCards > 0) {
    return `Showed ${count(compares, 'compare')} and ${count(flightCards, 'flight card')}`;
  }
  if (compares > 1) {
    return `Showed ${count(compares, 'compare')}`;
  }
  if (flightCards > 1) {
    return `Showed ${count(flightCards, 'flight card')}`;
  }

  return null;
}
