import { type Aircraft, createAtcStore } from '@atc/shared';
import type { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  AircraftCompare,
  AircraftCompareFallback,
} from './components/aircraft-compare';
import {
  ArrivalsBoard,
  ArrivalsBoardFallback,
} from './components/arrivals-board';
import { FlightCard, FlightCardFallback } from './components/flight-card';
import { ATC_STORE } from './store';

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

function setup() {
  const store = createAtcStore();
  store.applySnapshot({ at: 1, aircraft: [plane] });
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: ATC_STORE, useValue: store }],
  });

  return store;
}

test('the fallback shows the streaming note while the ID is incomplete', () => {
  setup();
  const fixture = TestBed.createComponent(FlightCardFallback);

  fixture.componentRef.setInput('partialProps', { note: 'Climbing out of' });
  fixture.detectChanges();

  const element = fixture.nativeElement as HTMLElement;
  expect(
    element.querySelector('[data-testid="flight-card-fallback"]')?.textContent,
  ).toContain('Climbing out of');
});

test('every fallback shows a quiet identifying line and two skeleton bars', () => {
  setup();
  const types: Type<unknown>[] = [
    FlightCardFallback,
    ArrivalsBoardFallback,
    AircraftCompareFallback,
  ];
  const fallbacks = types.map((type) => {
    const fixture = TestBed.createComponent(type);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  });

  const views = fallbacks.map((element) => ({
    line: element.querySelector('.atc-card-muted')?.textContent?.trim(),
    bars: element.querySelectorAll('.atc-skeleton-bar').length,
  }));

  expect(views).toEqual([
    { line: 'Identifying aircraft…', bars: 2 },
    { line: 'Identifying aircraft…', bars: 2 },
    { line: 'Identifying aircraft…', bars: 2 },
  ]);
});

test('a flight card updates live and freezes when the aircraft leaves', () => {
  const store = setup();
  const fixture = TestBed.createComponent(FlightCard);
  fixture.componentRef.setInput('note', 'Inbound.');
  fixture.componentRef.setInput('hex', 'AAAAAA');
  fixture.detectChanges();

  store.applySnapshot({ at: 2, aircraft: [{ ...plane, altitudeFt: 4000 }] });
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const live = element.querySelector(
    '[data-testid="flight-altitude"]',
  )?.textContent;
  store.applySnapshot({ at: 3, aircraft: [] });
  fixture.detectChanges();

  expect(live).toBe('4,000 ft');
  expect(
    element
      .querySelector('[data-testid="flight-card"]')
      ?.getAttribute('data-status'),
  ).toBe('out-of-range');
  expect(element.textContent).toContain('Out of range · last seen');
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

  const cards = ['bbbbbb', 'cccccc'].map((hex) => {
    const fixture = TestBed.createComponent(FlightCard);
    fixture.componentRef.setInput('note', 'Note.');
    fixture.componentRef.setInput('hex', hex);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  });

  const [privateCard, hexCard] = cards;
  expect(privateCard.querySelector('header')?.textContent?.trim()).toBe(
    'N352LL',
  );
  expect(privateCard.textContent).toContain('Cessna 172');
  expect(hexCard.querySelector('header')?.textContent?.trim()).toBe('CCCCCC');
  expect(hexCard.textContent).toContain('Unknown type');
  expect(privateCard.textContent).not.toContain('Route unavailable');
});

test('a flight card for an unknown ID says so instead of crashing', () => {
  setup();
  const fixture = TestBed.createComponent(FlightCard);

  fixture.componentRef.setInput('note', 'Hmm.');
  fixture.componentRef.setInput('hex', 'ffffff');
  fixture.detectChanges();

  const element = fixture.nativeElement as HTMLElement;
  expect(
    element
      .querySelector('[data-testid="flight-card"]')
      ?.getAttribute('data-status'),
  ).toBe('unknown');
  expect(element.textContent).toContain('Unknown aircraft');
});

test('the arrivals board renders one row per complete ID', () => {
  setup();
  const fixture = TestBed.createComponent(ArrivalsBoard);

  fixture.componentRef.setInput('title', 'Arriving');
  fixture.componentRef.setInput('airport', 'KSEA');
  fixture.componentRef.setInput('hexes', ['aaaaaa', 'bbbbbb']);
  fixture.detectChanges();

  const rows = (fixture.nativeElement as HTMLElement).querySelectorAll(
    '[data-testid="arrivals-row"]',
  );
  const element = fixture.nativeElement as HTMLElement;
  expect(element.querySelector('.atc-card-title')?.textContent).toBe(
    'Arriving',
  );
  expect([...rows].map((row) => row.getAttribute('data-hex'))).toEqual([
    'aaaaaa',
    'bbbbbb',
  ]);
});

test('the arrivals board hides ETA unless an aircraft is approaching its airport', () => {
  setup();
  const boards = (['KSEA', 'KBDN'] as const).map((airport) => {
    const fixture = TestBed.createComponent(ArrivalsBoard);
    fixture.componentRef.setInput('title', 'Traffic');
    fixture.componentRef.setInput('airport', airport);
    fixture.componentRef.setInput('hexes', ['aaaaaa']);
    fixture.detectChanges();

    return fixture.nativeElement as HTMLElement;
  });

  const views = boards.map((element) => ({
    headers: [...element.querySelectorAll('th')].map((th) => th.textContent),
    cells: element.querySelectorAll('[data-testid="arrivals-row"] td').length,
  }));

  expect(views).toEqual([
    { headers: ['Flight', 'Alt (ft)', 'Dist (nm)', 'ETA (min)'], cells: 4 },
    { headers: ['Flight', 'Alt (ft)', 'Dist (nm)'], cells: 3 },
  ]);
});

test('the arrivals board title has no dashes', () => {
  setup();
  const fixture = TestBed.createComponent(ArrivalsBoard);

  fixture.componentRef.setInput('title', 'Arrivals at Seattle — nearest first');
  fixture.componentRef.setInput('airport', 'KSEA');
  fixture.componentRef.setInput('hexes', []);
  fixture.detectChanges();

  const element = fixture.nativeElement as HTMLElement;
  expect(element.querySelector('.atc-card-title')?.textContent).toBe(
    'Arrivals at Seattle, nearest first',
  );
});

test('the compare takeaway has no dashes', () => {
  setup();
  const fixture = TestBed.createComponent(AircraftCompare);

  fixture.componentRef.setInput('takeaway', 'Same jet — different speeds');
  fixture.componentRef.setInput('hexes', ['aaaaaa', 'ffffff']);
  fixture.detectChanges();

  const note = (fixture.nativeElement as HTMLElement).querySelector(
    '.atc-card-note',
  );
  expect(note?.textContent).toBe('Same jet, different speeds');
});

test('the compare card shows each aircraft and unknown IDs', () => {
  setup();
  const fixture = TestBed.createComponent(AircraftCompare);

  fixture.componentRef.setInput('takeaway', 'Same jet.');
  fixture.componentRef.setInput('hexes', ['aaaaaa', 'ffffff']);
  fixture.detectChanges();

  const text = (fixture.nativeElement as HTMLElement).querySelector(
    '[data-testid="aircraft-compare"]',
  )?.textContent;
  expect(text).toContain('UAL100');
  expect(text).toContain('Unknown aircraft');
});

test('the arrivals board puts the type under the label and picks a live row to show it on the map', () => {
  const store = setup();
  const fixture = TestBed.createComponent(ArrivalsBoard);
  fixture.componentRef.setInput('title', 'Arriving');
  fixture.componentRef.setInput('airport', 'KSEA');
  fixture.componentRef.setInput('hexes', ['aaaaaa', 'bbbbbb']);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const rows = [
    ...element.querySelectorAll<HTMLElement>('[data-testid="arrivals-row"]'),
  ];

  const picks = rows.map((row) => row.querySelector('button'));
  picks[0]?.click();
  fixture.detectChanges();

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
  const card = TestBed.createComponent(FlightCard);
  card.componentRef.setInput('note', 'Inbound.');
  card.componentRef.setInput('hex', 'aaaaaa');
  card.detectChanges();
  const compare = TestBed.createComponent(AircraftCompare);
  compare.componentRef.setInput('takeaway', 'Same jet.');
  compare.componentRef.setInput('hexes', ['aaaaaa', 'ffffff']);
  compare.detectChanges();

  (card.nativeElement as HTMLElement).querySelector('button')?.click();
  const fromCard = store.getState().selectedHex;
  store.select(null);
  (compare.nativeElement as HTMLElement).querySelector('button')?.click();

  expect(fromCard).toBe('aaaaaa');
  expect(store.getState().selectedHex).toBe('aaaaaa');
  expect(
    (compare.nativeElement as HTMLElement).querySelectorAll('button').length,
  ).toBe(1);
});
