import type { LLMock } from '@copilotkit/aimock';
import { SELECTED_PROMPT, STARTER_PROMPTS } from '@atc/shared';
import {
  CLUSTER,
  NEAR_BEND,
  NO_FILTERS,
  PORTLAND_CLASS_C,
  scenario,
} from './traffic-fixtures';

const { selected, highest, fastest, arrivals, nearby, portland } = scenario;

/** The app's starter questions by what they ask, plus the typed questions the suite scripts. */
export const PROMPTS = {
  highestAndFastest: STARTER_PROMPTS[4].text,
  followFastest: STARTER_PROMPTS[5].text,
  nearBend: STARTER_PROMPTS[6].text,
  redmondAirport: STARTER_PROMPTS[7].text,
  /** No longer a starter: typed, or sent from the suggestions. */
  seattleArrivals: 'Show me everything landing at Seattle.',
  /** No longer a starter: typed. */
  portlandClassC: 'Which planes are inside the Portland Class C?',
  selected: SELECTED_PROMPT,
  /** Outlines KBDN with showArea before listing the traffic. */
  nearKbdn: "What's flying near KBDN?",
  /** Highlights the tight block of {@link CLUSTER}. */
  cluster: 'Highlight the Horizon block near Klamath Falls.',
  redmondAirspace: 'Show the Redmond airspace.',
  hideAirports: 'Hide the airports.',
  /** Streams a reasoning summary before its tool call. */
  reasoned: 'Which plane is highest?',
  /** Typed text the stubbed router sends to the map filter ({@link FILTER_JETS}). */
  filterJets: 'jets below 10,000 ft',
  /** Typed text the stubbed router sends to the map filter, clearing it. */
  clearFilter: 'clear the filter',
  /** Needs the planes a filter hides: the assistant calls clearMapFilter. */
  highestOverall: "what's the highest plane overall?",
} as const;

/** The map filter the scripted model streams for {@link PROMPTS.filterJets}. */
export const FILTER_JETS = {
  ...NO_FILTERS,
  kind: 'jet',
  maxAltitudeFt: 10_000,
} as const;

/** The reasoning summary the scripted model streams for {@link PROMPTS.reasoned}. */
export const REASONING = 'Comparing altitudes across the visible traffic.';

/** One tool call the scripted model makes. */
interface ScriptedCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: Record<string, unknown>;
}

/** The JSON a UI chat answer contains. */
function ui(
  ...components: Record<string, { props: Record<string, unknown> }>[]
): string {
  return JSON.stringify({ ui: components });
}

/**
 * Scripts one turn: `prompt` gets `toolCalls`, and the request that returns
 * their results gets `answer`. aimock matches a tool result by the id of the
 * request's last message, and parallel calls can finish in any order, so
 * every call id carries the same answer. That request also still holds the
 * prompt, and aimock serves the first fixture that matches, so the results
 * are registered before the prompt. With `reasoning`, the first response
 * streams it as a reasoning summary before the tool calls.
 */
function scriptTurn(
  mock: LLMock,
  prompt: string,
  toolCalls: readonly ScriptedCall[],
  answer: string,
  reasoning?: string,
): void {
  for (const { id } of toolCalls) {
    mock.onToolResult(id, async () => ({ content: answer }));
  }
  mock.onMessage(prompt, {
    toolCalls: [...toolCalls],
    ...(reasoning === undefined ? {} : { reasoning }),
  });
}

/**
 * Scripts the model's answers for {@link PROMPTS}: each question gets fixed
 * tool calls, and their results get a fixed UI answer over the synthetic
 * scenario aircraft. Used by the e2e suite and the demo video, so both show
 * the same conversation.
 */
export function scriptAtcModel(mock: LLMock): void {
  const card = (note: string, hex: string) => ({
    FlightCard: { props: { note, hex } },
  });
  const board = (
    title: string,
    airport: string,
    rows: readonly { hex: string }[],
  ) =>
    ui({
      ArrivalsBoard: {
        props: { title, airport, hexes: rows.map((row) => row.hex) },
      },
    });
  const nearBoard = board('Near Bend', NEAR_BEND.airport, nearby);
  const findNearby = {
    name: 'findAircraft',
    arguments: {
      ...NO_FILTERS,
      near: NEAR_BEND,
      sortBy: 'distance',
      limit: 20,
    },
  };
  const highlightNearby = {
    name: 'highlightAircraft',
    arguments: { hexes: nearby.map((row) => row.hex) },
  };

  // The map filter is a structured completion on /api/filter: its only user
  // message is JSON { request, current }, which holds the typed request.
  mock.onMessage(`"request":"${PROMPTS.filterJets}"`, {
    content: JSON.stringify(FILTER_JETS),
  });
  scriptTurn(
    mock,
    PROMPTS.highestOverall,
    [{ id: 'clear-filter', name: 'clearMapFilter', arguments: {} }],
    ui(card('The highest plane overall.', highest.hex)),
  );
  scriptTurn(
    mock,
    PROMPTS.selected,
    [{ id: 'selected-1', name: 'getSelectedAircraft', arguments: {} }],
    ui(card('This is the plane you selected.', selected.hex)),
  );
  scriptTurn(
    mock,
    PROMPTS.seattleArrivals,
    [
      {
        id: 'arrivals-find',
        name: 'findAircraft',
        arguments: {
          ...NO_FILTERS,
          approaching: 'KSEA',
          sortBy: 'distance',
          limit: 10,
        },
      },
      {
        id: 'arrivals-highlight',
        name: 'highlightAircraft',
        arguments: { hexes: arrivals.map((row) => row.hex) },
      },
    ],
    board('Arriving at Seattle', 'KSEA', arrivals),
  );
  scriptTurn(
    mock,
    PROMPTS.nearKbdn,
    [
      { id: 'near-area', name: 'showArea', arguments: NEAR_BEND },
      { id: 'near-find', ...findNearby },
      { id: 'near-highlight', ...highlightNearby },
    ],
    nearBoard,
  );
  // The near-Bend starter: the model lists nearby traffic without calling
  // showArea; findAircraft draws the ring itself.
  scriptTurn(
    mock,
    PROMPTS.nearBend,
    [
      { id: 'bend-find', ...findNearby },
      { id: 'bend-highlight', ...highlightNearby },
    ],
    nearBoard,
  );
  scriptTurn(
    mock,
    PROMPTS.cluster,
    [
      {
        id: 'cluster-highlight',
        name: 'highlightAircraft',
        arguments: { hexes: CLUSTER },
      },
    ],
    ui({
      Markdown: {
        props: { children: 'Six Horizon turboprops, flying north.' },
      },
    }),
  );
  scriptTurn(
    mock,
    PROMPTS.highestAndFastest,
    [
      {
        id: 'compare-find',
        name: 'findAircraft',
        arguments: { ...NO_FILTERS, sortBy: 'altitude', limit: 3 },
      },
    ],
    ui({
      AircraftCompare: {
        props: {
          takeaway: 'One climbs highest, one flies fastest.',
          hexes: [highest.hex, fastest.hex],
        },
      },
    }),
  );
  scriptTurn(
    mock,
    PROMPTS.reasoned,
    [
      {
        id: 'reasoned-find',
        name: 'findAircraft',
        arguments: { ...NO_FILTERS, sortBy: 'altitude', limit: 1 },
      },
    ],
    ui(card('The highest plane right now.', highest.hex)),
    REASONING,
  );
  scriptTurn(
    mock,
    PROMPTS.followFastest,
    [
      {
        id: 'follow-1',
        name: 'followAircraft',
        arguments: { hex: fastest.hex },
      },
    ],
    ui(card('Following this flight.', fastest.hex)),
  );
  scriptTurn(
    mock,
    PROMPTS.redmondAirport,
    [
      {
        id: 'airport-lookup',
        name: 'lookupPlace',
        arguments: { query: 'Redmond' },
      },
      {
        id: 'airport-show',
        name: 'showAirport',
        arguments: { airport: 'KRDM' },
      },
    ],
    ui({
      AirportCard: {
        props: { note: 'Redmond has a part-time tower.', airport: 'KRDM' },
      },
    }),
  );
  scriptTurn(
    mock,
    PROMPTS.hideAirports,
    [
      {
        id: 'hide-airports',
        name: 'setLayers',
        arguments: { airports: false, airspace: null },
      },
    ],
    'Airports are hidden.',
  );
  scriptTurn(
    mock,
    PROMPTS.portlandClassC,
    [
      {
        id: 'portland-lookup',
        name: 'lookupPlace',
        arguments: { query: 'Portland' },
      },
      {
        id: 'portland-find',
        name: 'findAircraft',
        arguments: {
          ...NO_FILTERS,
          inAirspace: PORTLAND_CLASS_C,
          sortBy: 'distance',
          limit: 20,
        },
      },
      {
        id: 'portland-highlight',
        name: 'highlightAircraft',
        arguments: { hexes: portland.map((row) => row.hex) },
      },
    ],
    board('Inside the Portland Class C', 'KPDX', portland),
  );
  scriptTurn(
    mock,
    PROMPTS.redmondAirspace,
    [
      {
        id: 'redmond-airspace',
        name: 'showAirspace',
        arguments: { airport: 'KRDM' },
      },
    ],
    ui({
      Markdown: { props: { children: 'Redmond has a part-time Class D.' } },
    }),
  );
}
