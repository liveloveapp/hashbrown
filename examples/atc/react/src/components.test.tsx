import { type Aircraft, type ChartAirport, createAtcStore } from '@atc/shared';
import { act, cleanup, render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import {
  AircraftCompare,
  AircraftCompareFallback,
} from './components/aircraft-compare';
import { ArrivalsBoard } from './components/arrivals-board';
import { AirportCard, AirportCardFallback } from './components/airport-card';
import { FlightCard, FlightCardFallback } from './components/flight-card';
import { AtcStoreProvider } from './store';

const plane: Aircraft = {
  hex: 'aaaaaa',
  label: 'UAL100',
  callsign: 'UAL100',
  registration: null,
  typeCode: 'B39M',
  category: null,
  kind: 'jet',
  lat: 47.5716,
  lon: -122.3088,
  altitudeFt: 5000,
  onGround: false,
  groundSpeedKt: 240,
  trackDeg: 180,
  verticalRateFpm: -800,
};

const krdm: ChartAirport = {
  code: 'KRDM',
  faa: 'RDM',
  name: 'Roberts Field',
  city: 'Redmond',
  state: 'OR',
  aliases: [],
  lat: 44.2541,
  lon: -121.15,
  elevationFt: 3082,
  kind: 'airport',
  towered: true,
  towerPartTime: true,
  frequencies: {
    tower: '124.5',
    atis: '119.025',
    ctaf: '124.5',
    unicom: '122.95',
  },
  weather: null,
  lighting: 'full',
  fuel: true,
  military: false,
  runways: [
    {
      id: '05/23',
      lengthFt: 7038,
      widthFt: 150,
      surface: 'ASPH',
      hard: true,
      ends: null,
      corners: null,
      bearingDeg: null,
    },
    {
      id: '11/29',
      lengthFt: 7006,
      widthFt: 100,
      surface: 'ASPH',
      hard: true,
      ends: null,
      corners: null,
      bearingDeg: null,
    },
  ],
  rank: 0,
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

test('a flight card for private or unidentified traffic shows the label and no airline line', () => {
  const store = setup();
  store.applySnapshot({
    at: 2,
    aircraft: [
      {
        ...plane,
        hex: 'bbbbbb',
        label: 'N352LL',
        callsign: 'N352LL',
        registration: 'N352LL',
        typeCode: 'C172',
        category: null,
        kind: 'single',
      },
      {
        ...plane,
        hex: 'cccccc',
        label: 'CCCCCC',
        callsign: null,
        registration: null,
        typeCode: null,
        category: null,
        kind: 'jet',
      },
    ],
  });

  render(
    <AtcStoreProvider store={store}>
      <FlightCard note="Light single." hex="bbbbbb" />
      <FlightCard note="Unidentified." hex="cccccc" />
    </AtcStoreProvider>,
  );

  const [privateCard, hexCard] = screen.getAllByTestId('flight-card');
  expect(privateCard.querySelector('header')).toHaveTextContent(/^N352LL$/);
  expect(privateCard).toHaveTextContent('Cessna 172');
  expect(hexCard.querySelector('header')).toHaveTextContent(/^CCCCCC$/);
  expect(hexCard).toHaveTextContent('Unknown type');
  expect(screen.queryByText('Route unavailable')).toBeNull();
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
        airport="KSEA"
        hexes={['aaaaaa', 'bbbbbb']}
      />
    </AtcStoreProvider>,
  );

  expect(
    screen.getAllByTestId('arrivals-row').map((row) => row.dataset['hex']),
  ).toEqual(['aaaaaa', 'bbbbbb']);
  expect(screen.getByText('Unknown aircraft')).toBeVisible();
});

test('the arrivals board hides ETA unless an aircraft is approaching its airport', () => {
  const store = setup();

  const views = (['KSEA', 'KBDN'] as const).map((airport) => {
    const { container, unmount } = render(
      <AtcStoreProvider store={store}>
        <ArrivalsBoard title="Traffic" airport={airport} hexes={['aaaaaa']} />
      </AtcStoreProvider>,
    );
    const view = {
      headers: [...container.querySelectorAll('th')].map(
        (th) => th.textContent,
      ),
      cells: container.querySelectorAll('[data-testid="arrivals-row"] td')
        .length,
    };
    unmount();

    return view;
  });

  expect(views).toEqual([
    { headers: ['Flight', 'Alt (ft)', 'Dist (nm)', 'ETA (min)'], cells: 4 },
    { headers: ['Flight', 'Alt (ft)', 'Dist (nm)'], cells: 3 },
  ]);
});

test('the arrivals board title has no dashes', () => {
  const store = setup();

  render(
    <AtcStoreProvider store={store}>
      <ArrivalsBoard
        title="Arrivals at Seattle — nearest first"
        airport="KSEA"
        hexes={[]}
      />
    </AtcStoreProvider>,
  );

  expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(
    'Arrivals at Seattle, nearest first',
  );
});

test('the compare takeaway has no dashes', () => {
  const store = setup();

  render(
    <AtcStoreProvider store={store}>
      <AircraftCompare
        takeaway="Same jet — different speeds"
        hexes={['aaaaaa', 'ffffff']}
      />
    </AtcStoreProvider>,
  );

  expect(screen.getByTestId('aircraft-compare')).toHaveTextContent(
    'Same jet, different speeds',
  );
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

test('the arrivals board puts the type under the label and picks a live row to show it on the map', () => {
  const store = setup();
  render(
    <AtcStoreProvider store={store}>
      <ArrivalsBoard
        title="Arriving"
        airport="KSEA"
        hexes={['aaaaaa', 'bbbbbb']}
      />
    </AtcStoreProvider>,
  );
  const rows = screen.getAllByTestId('arrivals-row');

  const picks = rows.map((row) => row.querySelector('button'));
  act(() => picks[0]?.click());

  expect(
    rows[0]?.querySelector('td')?.textContent?.replace(/\s+/g, ' ').trim(),
  ).toBe('UAL100 Boeing 737 MAX 9');
  expect(picks[1]).toBeNull();
  expect(store.getState().selectedHex).toBe('aaaaaa');
  expect(store.getState().viewRequest?.kind).toBe('aircraft');
  expect(rows[0]?.classList.contains('is-selected')).toBe(true);
});

test('a flight card header and a compare item are buttons that show the plane on the map', () => {
  const store = setup();
  const { container } = render(
    <AtcStoreProvider store={store}>
      <FlightCard note="Inbound." hex="aaaaaa" />
      <AircraftCompare takeaway="Same jet." hexes={['aaaaaa', 'ffffff']} />
    </AtcStoreProvider>,
  );
  const [cardButton, compareButton, ...rest] = [
    ...container.querySelectorAll('button'),
  ];

  act(() => cardButton?.click());
  const fromCard = store.getState().selectedHex;
  act(() => store.select(null));
  act(() => compareButton?.click());

  expect(fromCard).toBe('aaaaaa');
  expect(store.getState().selectedHex).toBe('aaaaaa');
  expect(rest).toEqual([]);
});

test('an airport card shows the title, badge, tower frequency and runway', () => {
  const store = setup();
  store.setChart({ cycle: '2610', effective: '2026-10-01', airports: [krdm] });

  const { container } = render(
    <AtcStoreProvider store={store}>
      <AirportCard note="x" airport="KRDM" />
    </AtcStoreProvider>,
  );

  const badge = container.querySelector('.atc-airport-badge');
  expect(screen.getByText('Roberts Field (RDM)')).toBeVisible();
  expect(badge).toHaveTextContent('Towered');
  expect(badge?.className).toBe('atc-airport-badge');
  expect(container.querySelector('dd')?.textContent).toBe('124.5★');
  expect(container.querySelector('.atc-airport-runways li')?.textContent).toBe(
    '05/23 · 7,038 × 150 ft · asphalt',
  );
});

test('the airport card head shows the airport on the map', () => {
  const store = setup();
  store.setChart({ cycle: '2610', effective: '2026-10-01', airports: [krdm] });
  const { container } = render(
    <AtcStoreProvider store={store}>
      <AirportCard note="x" airport="KRDM" />
    </AtcStoreProvider>,
  );

  act(() => container.querySelector('button')?.click());

  expect(store.getState().viewRequest?.kind).toBe('airport');
});

test('an airport card for an unknown code says so', () => {
  const store = setup();
  store.setChart({ cycle: '2610', effective: '2026-10-01', airports: [krdm] });

  render(
    <AtcStoreProvider store={store}>
      <AirportCard note="x" airport="KJFK" />
    </AtcStoreProvider>,
  );

  expect(screen.getByText('Unknown airport')).toBeVisible();
});

test('the airport fallback identifies the airport', () => {
  cleanup();

  render(<AirportCardFallback tag="AirportCard" partialProps={{}} />);

  expect(screen.getByText('Identifying airport…')).toBeVisible();
});
