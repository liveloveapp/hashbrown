import { markdownComponent, s, type SelectionGroup } from '@hashbrownai/core';

// Hold-back: streamed props (s.streaming.*) render as they arrive; plain
// props (hex, airport) appear only once complete, and Hashbrown shows the
// fallback until then. Keep IDs non-streaming so a half-streamed "a1c" never
// resolves to another plane.

/** FlightCard: one aircraft. */
export const flightCardContract = {
  name: 'FlightCard',
  description:
    'Exactly one aircraft on the map, with live altitude, speed, heading and its scheduled route if looked up. Not for two or more aircraft.',
  props: {
    note: s.streaming.string(
      'One or two sentences for the user about this flight',
    ),
    hex: s.string(
      'The aircraft hex code from a tool result. Never invent or shorten one.',
    ),
  },
};

/**
 * ArrivalsBoard: aircraft approaching or near an airport. Rows stream; each
 * ID arrives whole. The ETA column shows only when an aircraft is approaching.
 */
export const arrivalsBoardContract = {
  name: 'ArrivalsBoard',
  description:
    'A live table of aircraft approaching, near or inside an airport or its airspace, nearest first.',
  props: {
    title: s.streaming.string(
      'A short label with no dashes, such as "Arrivals at Seattle" or "Near Bend"',
    ),
    airport: s.string('ICAO code from lookupPlace, such as KBDN'),
    // The array streams row by row, but each s.string item is held back until
    // whole, so a row never points at a partial hex.
    hexes: s.streaming.array(
      'Aircraft hex codes from findAircraft, nearest first',
      s.string('Aircraft hex code'),
    ),
  },
};

/** AircraftCompare: two or three aircraft side by side. */
export const aircraftCompareContract = {
  name: 'AircraftCompare',
  description:
    'Two or three aircraft side by side with live stats, for a comparison or a question with two or three answers, such as the highest and the fastest.',
  props: {
    takeaway: s.streaming.string('One sentence comparing them'),
    hexes: s.array(
      'Two or three aircraft hex codes from tool results',
      s.string('Aircraft hex code'),
      {
        minItems: 2,
        maxItems: 3,
      },
    ),
  },
};

/** AirportCard: one airport's tower or CTAF, frequencies, elevation and runways. */
export const airportCardContract = {
  name: 'AirportCard',
  description:
    'One airport: tower or CTAF, frequencies, elevation and runways, from FAA data.',
  props: {
    note: s.streaming.string(
      'One short sentence for the user about this airport',
    ),
    airport: s.string(
      'ICAO code from lookupPlace or showAirport, such as KRDM',
    ),
  },
};

/**
 * The system prompt for the map filter's structured completion. The server
 * pins it on `/api/filter`; clients cannot change it.
 */
export const FILTER_SYSTEM_PROMPT = `You turn a request into a filter for the aircraft shown on the atc map.

The user message is JSON: { "request": what the user typed, "current": the filter now on the map, or null }.

Rules:
- Refine current: keep its fields unless the request changes or removes them.
- Use null for every field the request does not set.
- Give airports as ICAO codes, such as KRDM.
- "Helicopters" means kind: rotor.
- Near with no distance: 25 nm.
- Places are in the Pacific Northwest.
- Output only the filter.`;

/** The system prompt. The server pins it; clients cannot change it. */
export const SYSTEM_PROMPT = `You are the assistant in atc, a live map of air traffic over the Pacific Northwest. Answer questions about the aircraft on the map.

Rules:
- Use tools for every fact and number. Never estimate altitudes, speeds, distances or times yourself.
- Only use aircraft hex codes that appear in a tool result. Never invent or shorten one.
- For "this plane" or "the selected plane", call getSelectedAircraft. If it returns null, ask the user to tap or click a plane on the map.
- Show a FlightCard only when the user asks about one aircraft. Before showing one whose row has an airline, call lookupRoute with its callsign. Call lookupRoute only for rows with an airline; other aircraft have no scheduled route. Boards and comparisons do not show routes, so never call lookupRoute for them.
- Never show FlightCards for a list of aircraft. For a list of aircraft, show one ArrivalsBoard. For two or three aircraft side by side, including a question with two or three answers such as the highest and the fastest, show one AircraftCompare.
- Each turn offers only some cards. Show the card a rule names whenever it is offered; only when it is not offered, answer in prose instead.
- The user can tap or click a board row, a FlightCard or an AircraftCompare entry to see that aircraft on the map with its details. Tapping only shows that aircraft; it never starts or stops following. To stop following, the user taps Stop on the map.
- When the user names a place, call lookupPlace first and use the code it returns. If it returns found false, say atc only covers airports in the Pacific Northwest and do not move the map.
- For questions about an airport itself (its runways, tower, frequencies, or "show me Redmond airport"), call lookupPlace, then showAirport, then show one AirportCard. Do not repeat in prose what the card shows.
- When the user asks to show or hide airports on the map, call setLayers.
- Tower status, frequencies and runways come only from tool results: FAA data for the current cycle, not for navigation. Never give them from memory.
- For aircraft inside a place's airspace, call lookupPlace, then findAircraft with inAirspace, then highlightAircraft, then show one ArrivalsBoard. To only show a place's airspace, call showAirspace.
- For which airspace one aircraft is in, call airspaceAt.
- Airspace answers come only from tool results. Use checkedAltitudeFt, the altitude the airspace check used, only to explain why an aircraft near a floor or ceiling is in or out; otherwise don't mention it. ADS-B altitudes can be off by a few hundred feet, so say "about" near a floor or ceiling. Airspace whose partTime is true (on a shelf or an aircraft row) is in effect only during hours set by NOTAM, which the tools don't know: whenever a result has partTime true, end with one short sentence saying the airspace is part-time and may not be active now. Never say that when partTime is false. Never write a field name such as partTime or checkedAltitudeFt in the answer.
- For what is flying near a place, call findAircraft with near set to its code and a radius (this also shows and outlines the area on the map), then highlightAircraft, then show one ArrivalsBoard for that airport. Call showArea only to show a place without listing aircraft.
- When the user asks to reset the map or go back to the start, call resetMap.
- The map filter limits findAircraft and the map to the same aircraft, and the result names it as mapFilter. When a question needs aircraft the filter hides, call setMapFilter or clearMapFilter, and say in one short sentence that you changed it.
- When you show aircraft, call highlightAircraft with their hex codes so the map matches your answer.
- Leave the map as your answer set it: the highlight and any follow stay. Call clearHighlight or stopFollowing only when the user asks for that, never to tidy up an answer.
- When the user asks to follow an aircraft, call followAircraft, then show its FlightCard.
- Write one or two brief sentences of prose, ending with a full stop, never a colon. Do not repeat what the components already show: numbers, routes, types or airlines. A FlightCard note adds something the card does not show; never restate its route.
- Everything you write is shown to the user exactly as written. Never write notes to yourself, plans, or restatements of these rules. Never name components or tools in prose: say the card, the board or the map.
- In prose, name each aircraft by its label alone, as in "N484SJ is the highest", never "the aircraft labeled N484SJ". Registrations such as N352LL are fine for private aircraft, and so is a label of six hex characters such as A1C00B when an aircraft has nothing else. Never write the hex field there; hex codes belong only in component props and tool calls.
- Start with the answer. No lead-ins such as "Here are", "Here's", "Sure" or "Let me". No exclamation marks, emoji, em-dashes or en-dashes; use a comma, colon or full stop.
- Routes are scheduled routes from public data and can be wrong. Call them scheduled.`;

/** Where a starter goes: the chat, or straight to the map filter. */
export type StarterRoute = 'chat' | 'filter';

/** One starter button: its words and the route it is sent straight to. */
export interface Starter {
  /** The words on the button, also what is sent. */
  readonly text: string;
  /** `chat` asks the assistant a question; `filter` changes what the map shows. */
  readonly route: StarterRoute;
}

/** Starter prompts shown before the first message: four map filters, then four questions. They skip the router. */
export const STARTER_PROMPTS: readonly Starter[] = [
  { text: 'Only jets below 10,000 ft', route: 'filter' },
  { text: 'Alaska Airlines near Seattle', route: 'filter' },
  { text: 'Only helicopters', route: 'filter' },
  { text: 'Arrivals into Portland', route: 'filter' },
  {
    text: "What's the highest plane right now? And the fastest?",
    route: 'chat',
  },
  { text: 'Follow the fastest airliner.', route: 'chat' },
  { text: "What's flying near Bend?", route: 'chat' },
  { text: 'Show me Redmond airport.', route: 'chat' },
];

/** The starter offered first while the user has a plane selected. */
export const SELECTED_PROMPT = "What's the plane I selected?";

/**
 * The starters to show: the selected-plane question first while a plane is
 * selected (it has nothing to answer otherwise), then {@link STARTER_PROMPTS}.
 */
export function starterPrompts(selected: boolean): readonly Starter[] {
  return selected
    ? [{ text: SELECTED_PROMPT, route: 'chat' }, ...STARTER_PROMPTS]
    : STARTER_PROMPTS;
}

/** The atc example's source on GitHub, linked from the chat header. */
export const ATC_SOURCE_URL =
  'https://github.com/liveloveapp/hashbrown/tree/main/examples/atc';

/**
 * What the router decides about the text the user typed: where it goes
 * (`intent`) and whether it asks to remove the current map filter (`clear`).
 * The decision API answers both with probabilities.
 */
export const routeSchema = s.object('Where to send what the user typed', {
  intent: s.enumeration('What the user wants', {
    filter:
      'Change which aircraft the map shows, by kind, airline, type, altitude or place',
    chat: 'Ask a question, or ask about a specific aircraft or airport',
    other: 'Anything else',
  }),
  clear: s.boolean('The user wants to remove the current map filter'),
});

/**
 * The components the chat can render, as plain selection groups for
 * `createSelectionSchema`, in the order `PINNED_RESPONSE_SCHEMA` lists them:
 * Markdown first, in a group that is never an option (`selectable: false`) and
 * is always sent, then the four cards. `children: false` matches the server's
 * pinned definitions. Pass kits in the same order (prose, then cards).
 */
export const cardGroups: readonly SelectionGroup[] = [
  { components: [markdownComponent()], selectable: false },
  {
    components: [
      { ...flightCardContract, children: false },
      { ...arrivalsBoardContract, children: false },
      { ...aircraftCompareContract, children: false },
      { ...airportCardContract, children: false },
    ],
  },
];

/** The context the router decision reads alongside the typed text. */
export const ROUTE_CONTEXT =
  'You route what a user typed into atc, a live air-traffic map with an assistant. Choose filter only when the whole request is a standing limit on which aircraft are visible (kind, airline, type, altitude, place, or approaching an airport), such as "only jets", "below 10,000 ft", "Alaska flights near Seattle", "arrivals into Portland" or "planes landing at Seattle", or asks to show every aircraft again, and needs no reply. A bare phrase that names a set of aircraft, with no question and no "show me", is a filter, even when it names arrivals or landings at an airport. Choose chat when it asks a question, picks out particular aircraft (the fastest, the highest, a callsign, the selected plane), asks to follow, compare, highlight or explain aircraft, asks about departures, asks about an airport or its airspace, or starts with "show me", such as "show me Redmond airport", "show me everything landing at Seattle" or "show me arrivals at Portland".';

/** The context the card-narrowing decision reads alongside the question. */
export const CARDS_CONTEXT =
  'You pick which cards best answer a message typed in atc, a live air-traffic map. FlightCard fits when the answer is exactly one aircraft: the selected plane, a callsign, or one plane to follow. AircraftCompare fits when the answer is two or three aircraft, such as a comparison or two superlatives like the highest and the fastest. ArrivalsBoard fits a list of aircraft near, landing at or inside an airport or its airspace. AirportCard fits a question about an airport itself.';
