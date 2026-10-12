import type { LLMock } from '@copilotkit/aimock';
import { SELECTED_PROMPT, STARTER_PROMPTS } from '@atc/shared';
import {
  CLUSTER,
  NEAR_BEND,
  NO_FILTERS,
  PORTLAND_CLASS_C,
  scenario,
  ui,
} from './fixtures';

const { selected, highest, fastest, arrivals, nearby, portland } = scenario;

/** A typed question that outlines KBDN with showArea before listing traffic. */
export const NEAR_PROMPT = "What's flying near KBDN?";

/** A typed question that highlights the tight block of {@link CLUSTER}. */
export const CLUSTER_PROMPT = 'Highlight the Horizon block near Klamath Falls.';

/**
 * Scripts the model's answers for the starter prompts, {@link NEAR_PROMPT}
 * and {@link CLUSTER_PROMPT}: each message gets fixed tool calls, and each
 * tool result gets a fixed UI answer over the synthetic scenario aircraft.
 * Used by the e2e suite and the demo video, so both show the same
 * conversation.
 */
export function scriptAtcModel(mock: LLMock): void {
  const card = (note: string, hex: string) => ({
    FlightCard: { props: { note, hex } },
  });
  const board = ui({
    ArrivalsBoard: {
      props: {
        title: 'Arriving at Seattle',
        airport: 'KSEA',
        hexes: arrivals.map((r) => r.hex),
      },
    },
  });
  const nearBoard = ui({
    ArrivalsBoard: {
      props: {
        title: 'Near Bend',
        airport: NEAR_BEND.airport,
        hexes: nearby.map((r) => r.hex),
      },
    },
  });
  for (const id of ['near-area', 'near-find', 'near-highlight']) {
    mock.onToolResult(id, async () => ({ content: nearBoard }));
  }
  mock.onMessage(NEAR_PROMPT, {
    toolCalls: [
      { id: 'near-area', name: 'showArea', arguments: NEAR_BEND },
      {
        id: 'near-find',
        name: 'findAircraft',
        arguments: {
          ...NO_FILTERS,
          near: NEAR_BEND,
          sortBy: 'distance',
          limit: 20,
        },
      },
      {
        id: 'near-highlight',
        name: 'highlightAircraft',
        arguments: { hexes: nearby.map((r) => r.hex) },
      },
    ],
  });
  // The near-Bend starter: the model lists nearby traffic without calling
  // showArea; findAircraft draws the ring itself.
  for (const id of ['bend-find', 'bend-highlight']) {
    mock.onToolResult(id, async () => ({ content: nearBoard }));
  }
  mock.onMessage(STARTER_PROMPTS[0], {
    toolCalls: [
      {
        id: 'bend-find',
        name: 'findAircraft',
        arguments: {
          ...NO_FILTERS,
          near: NEAR_BEND,
          sortBy: 'distance',
          limit: 20,
        },
      },
      {
        id: 'bend-highlight',
        name: 'highlightAircraft',
        arguments: { hexes: nearby.map((r) => r.hex) },
      },
    ],
  });
  mock.onToolResult('selected-1', async () => ({
    content: ui(card('This is the plane you selected.', selected.hex)),
  }));
  mock.onToolResult('arrivals-find', async () => ({ content: board }));
  mock.onToolResult('arrivals-highlight', async () => ({ content: board }));
  mock.onToolResult('compare-find', async () => ({
    content: ui({
      AircraftCompare: {
        props: {
          takeaway: 'One climbs highest, one flies fastest.',
          hexes: [highest.hex, fastest.hex],
        },
      },
    }),
  }));
  mock.onToolResult('follow-1', async () => ({
    content: ui(card('Following this flight.', fastest.hex)),
  }));
  mock.onMessage(SELECTED_PROMPT, {
    toolCalls: [
      { id: 'selected-1', name: 'getSelectedAircraft', arguments: {} },
    ],
  });
  mock.onMessage(STARTER_PROMPTS[1], {
    toolCalls: [
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
        arguments: { hexes: arrivals.map((r) => r.hex) },
      },
    ],
  });
  mock.onMessage(STARTER_PROMPTS[2], {
    toolCalls: [
      {
        id: 'compare-find',
        name: 'findAircraft',
        arguments: { ...NO_FILTERS, sortBy: 'altitude', limit: 3 },
      },
    ],
  });
  mock.onMessage(STARTER_PROMPTS[3], {
    toolCalls: [
      {
        id: 'follow-1',
        name: 'followAircraft',
        arguments: { hex: fastest.hex },
      },
    ],
  });
  const airportCard = ui({
    AirportCard: {
      props: { note: 'Redmond has a part-time tower.', airport: 'KRDM' },
    },
  });
  for (const id of ['airport-lookup', 'airport-show']) {
    mock.onToolResult(id, async () => ({ content: airportCard }));
  }
  mock.onMessage(STARTER_PROMPTS[4], {
    toolCalls: [
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
  });
  const portlandBoard = ui({
    ArrivalsBoard: {
      props: {
        title: 'Inside the Portland Class C',
        airport: 'KPDX',
        hexes: portland.map((r) => r.hex),
      },
    },
  });
  for (const id of ['portland-lookup', 'portland-find', 'portland-highlight']) {
    mock.onToolResult(id, async () => ({ content: portlandBoard }));
  }
  mock.onMessage(STARTER_PROMPTS[5], {
    toolCalls: [
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
        arguments: { hexes: portland.map((r) => r.hex) },
      },
    ],
  });
  mock.onToolResult('redmond-airspace', async () => ({
    content: ui({
      Markdown: { props: { children: 'Redmond has a part-time Class D.' } },
    }),
  }));
  mock.onMessage('Show the Redmond airspace.', {
    toolCalls: [
      {
        id: 'redmond-airspace',
        name: 'showAirspace',
        arguments: { airport: 'KRDM' },
      },
    ],
  });
  mock.onToolResult('cluster-highlight', async () => ({
    content: ui({
      Markdown: {
        props: { children: 'Six Horizon turboprops, flying north.' },
      },
    }),
  }));
  mock.onMessage(CLUSTER_PROMPT, {
    toolCalls: [
      {
        id: 'cluster-highlight',
        name: 'highlightAircraft',
        arguments: { hexes: CLUSTER },
      },
    ],
  });
  mock.onToolResult('hide-airports', async () => ({
    content: 'Airports are hidden.',
  }));
  mock.onMessage('Hide the airports.', {
    toolCalls: [
      {
        id: 'hide-airports',
        name: 'setLayers',
        arguments: { airports: false, airspace: null },
      },
    ],
  });
}
