/**
 * Checks for the assistant's answers: words a user should never see, such
 * as a rule echoed back ("Two short sentences."), a component or tool name,
 * an answer that stops on a colon, or a tap that promises something the app
 * does not do; and a map left without the highlight the answer needs. Used
 * by the live prose eval (`prose/eval.ts`).
 */

/** What kind of problem a paragraph has. */
export type ProseIssueKind =
  | 'leak'
  | 'internal-name'
  | 'dangling-colon'
  | 'false-tap'
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

/** Component and tool names the model sees but users never should. */
const INTERNAL_NAME =
  /\b(FlightCard|ArrivalsBoard|AircraftCompare|AirportCard|findAircraft|highlightAircraft|lookupRoute|lookupPlace|showArea|resetMap|followAircraft|setLayers|showAirport|showAirspace|airspaceAt|getSelectedAircraft|partTime|checkedAltitudeFt|altitudeSource|inAirspace|highlightedAirspace)\b/;

/** A paragraph that ends on a colon, with nothing after it. */
const DANGLING_COLON = /:\s*$/;

/** A tap that starts or stops following (only the map's Stop does that). */
const FALSE_TAP = /\btap\b(?! stop\b)[^.]*\b(follow|stop following|unfollow)/i;

const CHECKS: readonly (readonly [ProseIssueKind, RegExp])[] = [
  ['leak', LEAK],
  ['internal-name', INTERNAL_NAME],
  ['dangling-colon', DANGLING_COLON],
  ['false-tap', FALSE_TAP],
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
