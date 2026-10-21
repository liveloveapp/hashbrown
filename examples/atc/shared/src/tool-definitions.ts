import { s } from '@hashbrownai/core';
import { aircraftFilterFields, findAircraftInput } from './find-aircraft';

const noInput = s.object('No input', {});

/**
 * Each atc tool's name, description and input schema, without its handler.
 * The browser adds handlers in `createAtcTools` (`tools.ts`); the server
 * sends these definitions to the model in place of whatever the client sent,
 * so `/api/run` cannot be used as a general-purpose proxy.
 */
export const ATC_TOOL_DEFINITIONS = {
  findAircraft: {
    name: 'findAircraft' as const,
    description:
      "Find aircraft on the map by airline, type, kind, altitude, approach or distance from an airport, or keep only aircraft inside an airport's airspace (optionally of one class). With near, the map also shows and outlines that area; with inAirspace, it highlights that airspace; with both, the airspace highlight is shown. Returns compact rows.",
    schema: findAircraftInput,
  },
  setMapFilter: {
    name: 'setMapFilter' as const,
    description:
      'Filter the aircraft shown on the map, replacing any filter already set. findAircraft applies this filter too, and its result names it. Use it when a question needs a different filter, and tell the user when you change it. Returns the filter in words and any airport codes it does not know.',
    schema: s.object('The map filter', aircraftFilterFields),
  },
  clearMapFilter: {
    name: 'clearMapFilter' as const,
    description:
      'Remove the map filter so every aircraft shows again. Only when the question needs aircraft the filter hides, or the user asks for all traffic.',
    schema: noInput,
  },
  getSelectedAircraft: {
    name: 'getSelectedAircraft' as const,
    description:
      'Get the aircraft the user clicked on the map, or null if none is selected.',
    schema: noInput,
  },
  lookupRoute: {
    name: 'lookupRoute' as const,
    description:
      "Look up an airline flight's scheduled route by its airline callsign. Routes come from public data and can be wrong.",
    schema: s.object('Route lookup', {
      callsign: s.string('The callsign, such as UAL1372'),
    }),
  },
  highlightAircraft: {
    name: 'highlightAircraft' as const,
    description: 'Highlight these aircraft on the map and dim the rest.',
    schema: s.object('Aircraft to highlight', {
      hexes: s.array(
        'Aircraft hex codes from tool results',
        s.string('Aircraft hex code'),
      ),
    }),
  },
  clearHighlight: {
    name: 'clearHighlight' as const,
    description:
      'Remove the highlight so every aircraft looks the same again. Only when the user asks to clear the highlight or see all traffic; never at the end of an answer.',
    schema: noInput,
  },
  followAircraft: {
    name: 'followAircraft' as const,
    description: 'Keep the map centred on one aircraft.',
    schema: s.object('Aircraft to follow', {
      hex: s.string('Aircraft hex code from a tool result'),
    }),
  },
  stopFollowing: {
    name: 'stopFollowing' as const,
    description:
      'Stop following an aircraft. Only when the user asks to stop following.',
    schema: noInput,
  },
  lookupPlace: {
    name: 'lookupPlace' as const,
    description:
      'Find a Pacific Northwest airport by ICAO, IATA or FAA code, name or city. Returns its ICAO code, or found false.',
    schema: s.object('Place lookup', {
      query: s.string('What the user called the place, such as Bend or KBDN'),
    }),
  },
  showArea: {
    name: 'showArea' as const,
    description:
      'Move the map to a circle around an airport and outline it. Returns how many aircraft are inside.',
    schema: s.object('Area to show', {
      airport: s.string('ICAO code from lookupPlace, such as KBDN'),
      radiusNm: s.anyOf([
        s.number('Radius in nautical miles, 5 to 150; 25 if null'),
        s.nullish(),
      ]),
    }),
  },
  resetMap: {
    name: 'resetMap' as const,
    description:
      'Return the map to its home view over central Oregon (Bend, Redmond, Sisters, Prineville) and remove any area outline.',
    schema: noInput,
  },
  showAirport: {
    name: 'showAirport' as const,
    description:
      'Show one airport on the map at diagram zoom, with its runways and taxiways, and turn the airports layer on. Returns its tower, frequencies, runways and elevation from FAA data.',
    schema: s.object('Airport to show', {
      airport: s.string('ICAO code from lookupPlace, such as KRDM'),
    }),
  },
  showAirspace: {
    name: 'showAirspace' as const,
    description:
      "Show a place's controlled airspace (Class B, C, D and the Class E surface area) on the map, highlighted, and return its shelves and how many aircraft are inside.",
    schema: s.object('Airspace to show', {
      airport: s.string('ICAO code from lookupPlace, such as KPDX'),
    }),
  },
  airspaceAt: {
    name: 'airspaceAt' as const,
    description:
      'Which controlled airspace one aircraft is in now, from its position and altitude.',
    schema: s.object('Aircraft to check', {
      hex: s.string('Aircraft hex code from a tool result'),
    }),
  },
  setLayers: {
    name: 'setLayers' as const,
    description:
      'Show or hide map overlays. Pass null to leave a layer as it is.',
    schema: s.object('Layers', {
      airports: s.anyOf([s.boolean('Show airports'), s.nullish()]),
      airspace: s.anyOf([s.boolean('Show airspace'), s.nullish()]),
    }),
  },
};

/** The name of one atc tool. */
export type AtcToolName = keyof typeof ATC_TOOL_DEFINITIONS;

/** The name of every atc tool. */
export const ATC_TOOL_NAMES = Object.keys(
  ATC_TOOL_DEFINITIONS,
) as readonly AtcToolName[];
