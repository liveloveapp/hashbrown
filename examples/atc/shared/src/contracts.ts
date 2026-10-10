import { s } from '@hashbrownai/core';

/**
 * FlightCard: one aircraft. `note` streams first; `hex` is never streamed, so
 * the card only resolves to a plane once its full ID has arrived.
 */
export const flightCardContract = {
  name: 'FlightCard',
  description:
    'One aircraft on the map, with live altitude, speed, heading and its scheduled route if looked up.',
  props: {
    note: s.streaming.string(
      'One or two sentences for the user about this flight',
    ),
    hex: s.string(
      'The aircraft hex code from a tool result. Never invent or shorten one.',
    ),
  },
};

/** ArrivalsBoard: aircraft approaching an airport. Rows stream; each ID arrives whole. */
export const arrivalsBoardContract = {
  name: 'ArrivalsBoard',
  description:
    'A live table of aircraft approaching an airport, nearest first.',
  props: {
    title: s.streaming.string(
      'A short label with no dashes, such as "Arrivals at Seattle"',
    ),
    airport: s.enumeration('The airport the aircraft are approaching', [
      'SEA',
      'PDX',
      'BOI',
      'RDM',
    ]),
    hexes: s.streaming.array(
      'Aircraft hex codes from findAircraft, nearest first',
      s.string('Aircraft hex code'),
    ),
  },
};

/** AircraftCompare: two or three aircraft side by side. */
export const aircraftCompareContract = {
  name: 'AircraftCompare',
  description: 'Two or three aircraft side by side with live stats.',
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

/** The system prompt. The server pins it; clients cannot change it. */
export const SYSTEM_PROMPT = `You are the assistant in atc, a live map of airline traffic over the Pacific Northwest. Answer questions about the aircraft on the map.

Rules:
- Use tools for every fact and number. Never estimate altitudes, speeds, distances or times yourself.
- Only use aircraft hex codes that appear in a tool result. Never invent or shorten one.
- For "this plane" or "the selected plane", call getSelectedAircraft. If it returns null, ask the user to click a plane.
- Before showing one aircraft, call lookupRoute with its callsign, then show a FlightCard.
- For a list of aircraft, show an ArrivalsBoard. For two or three aircraft side by side, show an AircraftCompare.
- When you show aircraft, call highlightAircraft with their hex codes so the map matches your answer.
- When the user asks to follow an aircraft, call followAircraft, then show its FlightCard.
- Keep prose to one or two short Markdown sentences. Do not repeat numbers the components already show.
- In prose, refer to aircraft by callsign. Never write a hex code there; hex codes belong only in component props and tool calls.
- Start with the answer. No lead-ins such as "Here are", "Here's", "Sure" or "Let me". No exclamation marks, emoji, em-dashes or en-dashes; use a comma, colon or full stop.
- Routes are scheduled routes from public data and can be wrong. Call them scheduled.`;

/** Starter prompts shown before the first message. */
export const STARTER_PROMPTS: readonly string[] = [
  "What's the plane I selected?",
  'Show me everything landing at Seattle.',
  "What's the highest plane right now? And the fastest?",
  'Follow the fastest airliner.',
];

/** Links to each framework's core file. */
export const SOURCE_URLS = {
  angular:
    'https://github.com/liveloveapp/hashbrown/blob/main/examples/atc/angular/src/app/assistant.ts',
  react:
    'https://github.com/liveloveapp/hashbrown/blob/main/examples/atc/react/src/assistant.tsx',
} as const;
