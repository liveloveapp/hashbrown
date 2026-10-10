import { type Aircraft, createAtcStore } from '@atc/shared';
import { act, cleanup, render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import {
  AircraftCompare,
  AircraftCompareFallback,
} from './components/aircraft-compare';
import { ArrivalsBoard } from './components/arrivals-board';
import { FlightCard, FlightCardFallback } from './components/flight-card';
import { AtcStoreProvider } from './store';

const plane: Aircraft = {
  hex: 'aaaaaa',
  callsign: 'UAL100',
  typeCode: 'B39M',
  lat: 47.5716,
  lon: -122.3088,
  altitudeFt: 5000,
  onGround: false,
  groundSpeedKt: 240,
  trackDeg: 180,
  verticalRateFpm: -800,
};

function setup() {
  cleanup();
  const store = createAtcStore();
  store.applySnapshot({ at: 1, aircraft: [plane] });

  return store;
}

test('the fallback shows the streaming note while the ID is incomplete', () => {
  cleanup();

  render(
    <FlightCardFallback
      tag="FlightCard"
      partialProps={{ note: 'Climbing out of' }}
    />,
  );

  expect(screen.getByTestId('flight-card-fallback')).toHaveTextContent(
    'Climbing out of',
  );
  expect(screen.getByText('Identifying aircraft…')).toBeVisible();
  expect(screen.queryByTestId('flight-card')).toBeNull();
});

test('a flight card updates live and freezes when the aircraft leaves', () => {
  const store = setup();
  render(
    <AtcStoreProvider store={store}>
      <FlightCard note="Inbound." hex="AAAAAA" />
    </AtcStoreProvider>,
  );

  act(() =>
    store.applySnapshot({ at: 2, aircraft: [{ ...plane, altitudeFt: 4000 }] }),
  );
  const live = screen.getByTestId('flight-altitude').textContent;
  act(() => store.applySnapshot({ at: 3, aircraft: [] }));

  expect(live).toBe('4,000 ft');
  expect(screen.getByTestId('flight-card')).toHaveAttribute(
    'data-status',
    'out-of-range',
  );
  expect(screen.getByText(/Out of range · last seen/)).toBeVisible();
  expect(store.getState().pulse?.hex).toBe('aaaaaa');
});

test('a flight card for an unknown ID says so instead of crashing', () => {
  const store = setup();

  render(
    <AtcStoreProvider store={store}>
      <FlightCard note="Hmm." hex="ffffff" />
    </AtcStoreProvider>,
  );

  expect(screen.getByTestId('flight-card')).toHaveAttribute(
    'data-status',
    'unknown',
  );
  expect(screen.getByText('Unknown aircraft')).toBeVisible();
});

test('the arrivals board renders one row per complete ID', () => {
  const store = setup();

  render(
    <AtcStoreProvider store={store}>
      <ArrivalsBoard
        title="Arriving"
        airport="SEA"
        hexes={['aaaaaa', 'bbbbbb']}
      />
    </AtcStoreProvider>,
  );

  expect(
    screen.getAllByTestId('arrivals-row').map((row) => row.dataset['hex']),
  ).toEqual(['aaaaaa', 'bbbbbb']);
  expect(screen.getByText('Unknown aircraft')).toBeVisible();
});

test('the compare card waits for its IDs, then shows each aircraft', () => {
  const store = setup();

  render(
    <AtcStoreProvider store={store}>
      <AircraftCompareFallback
        tag="AircraftCompare"
        partialProps={{ takeaway: 'The 737' }}
      />
      <AircraftCompare takeaway="Same jet." hexes={['aaaaaa', 'ffffff']} />
    </AtcStoreProvider>,
  );

  expect(screen.getByTestId('aircraft-compare-fallback')).toHaveTextContent(
    'The 737',
  );
  expect(screen.getByTestId('aircraft-compare')).toHaveTextContent('UAL100');
  expect(screen.getByTestId('aircraft-compare')).toHaveTextContent(
    'Unknown aircraft',
  );
});
