import { expect, test } from 'vitest';
import type { Aircraft } from './aircraft';
import { applySnapshot, INITIAL_STATE } from './store';
import {
  arrivalsRows,
  feedBadgeView,
  flightCardView,
  messageText,
  routeText,
} from './views';

const plane: Aircraft = {
  hex: 'aaaaaa',
  callsign: 'UAL100',
  typeCode: 'B39M',
  lat: 42.1,
  lon: -87.9048,
  altitudeFt: 5000,
  onGround: false,
  groundSpeedKt: 240,
  trackDeg: 180,
  verticalRateFpm: -800,
};

test('flightCardView describes a live aircraft', () => {
  const state = applySnapshot(INITIAL_STATE, { at: 1, aircraft: [plane] });

  const view = flightCardView(state, 'AAAAAA');

  expect(view).toEqual({
    status: 'live',
    hex: 'aaaaaa',
    callsign: 'UAL100',
    airline: 'United Airlines',
    aircraftType: 'Boeing 737 MAX 9',
    altitude: '5,000 ft',
    speed: '240 kt',
    heading: '180°',
    route: null,
    lastSeen: null,
  });
});

test('flightCardView freezes departed aircraft and reports unknown IDs', () => {
  const seen = applySnapshot(INITIAL_STATE, {
    at: Date.UTC(2026, 9, 9, 12, 4),
    aircraft: [plane],
  });
  const gone = applySnapshot(seen, {
    at: Date.UTC(2026, 9, 9, 12, 5),
    aircraft: [],
  });

  const departed = flightCardView(gone, 'aaaaaa', 'UTC');
  const unknown = flightCardView(gone, 'not-a-plane');

  expect(departed).toMatchObject({
    status: 'out-of-range',
    lastSeen: '12:04',
    altitude: '5,000 ft',
  });
  expect(unknown).toEqual({ status: 'unknown', hex: 'not-a-plane' });
});

test('routeText distinguishes not looked up, missing and found', () => {
  const stops = [
    {
      iata: 'SFO',
      name: 'San Francisco International Airport',
      city: 'San Francisco',
    },
    {
      iata: 'ORD',
      name: "Chicago O'Hare International Airport",
      city: 'Chicago',
    },
  ];
  const routes = new Map([
    ['UAL100', { stops }],
    ['DAL1', null],
  ]);

  const texts = [
    routeText(routes, 'UAL100'),
    routeText(routes, 'DAL1'),
    routeText(routes, 'SWA1'),
  ];

  expect(texts).toEqual([
    'SFO → ORD · scheduled route',
    'Route unavailable',
    null,
  ]);
});

test('arrivalsRows computes distance and ETA to the airport', () => {
  const state = applySnapshot(INITIAL_STATE, { at: 1, aircraft: [plane] });

  const rows = arrivalsRows(state, 'ORD', ['aaaaaa', 'bbbbbb']);

  expect(rows).toEqual([
    {
      hex: 'aaaaaa',
      status: 'live',
      callsign: 'UAL100',
      aircraftType: 'Boeing 737 MAX 9',
      altitude: '5,000 ft',
      distance: '7 nm',
      eta: '2 min',
    },
    {
      hex: 'bbbbbb',
      status: 'unknown',
      callsign: '—',
      aircraftType: 'Unknown aircraft',
      altitude: '—',
      distance: '—',
      eta: '—',
    },
  ]);
});

test('feedBadgeView offers replay only when stalled', () => {
  const views = (
    ['connecting', 'live', 'delayed', 'stalled', 'replay'] as const
  ).map(feedBadgeView);

  expect(views).toEqual([
    { label: 'Connecting…', offerReplay: false },
    { label: 'Live · adsb.lol', offerReplay: false },
    { label: 'Data delayed', offerReplay: false },
    { label: 'Data delayed', offerReplay: true },
    { label: 'Replay · recorded traffic', offerReplay: false },
  ]);
});

test('messageText reads string content and ignores anything else', () => {
  const texts = [
    messageText('hello'),
    messageText([{ type: 'text', text: 'x' }]),
    messageText(undefined),
  ];

  expect(texts).toEqual(['hello', '', '']);
});
