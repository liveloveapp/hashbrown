import { type Aircraft, createAtcStore } from '@atc/shared';
import { TestBed } from '@angular/core/testing';
import {
  AircraftCompareComponent,
  AircraftCompareFallbackComponent,
} from './components/aircraft-compare';
import {
  ArrivalsBoardComponent,
  ArrivalsBoardFallbackComponent,
} from './components/arrivals-board';
import {
  FlightCardComponent,
  FlightCardFallbackComponent,
} from './components/flight-card';
import { ATC_STORE } from './store';

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
  const fixture = TestBed.createComponent(FlightCardFallbackComponent);

  fixture.componentRef.setInput('partialProps', { note: 'Climbing out of' });
  fixture.detectChanges();

  const element = fixture.nativeElement as HTMLElement;
  expect(
    element.querySelector('[data-testid="flight-card-fallback"]')?.textContent,
  ).toContain('Climbing out of');
});

test('every fallback shows a quiet identifying line and two skeleton bars', () => {
  setup();
  const fallbacks = [
    FlightCardFallbackComponent,
    ArrivalsBoardFallbackComponent,
    AircraftCompareFallbackComponent,
  ].map((type) => {
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
  const fixture = TestBed.createComponent(FlightCardComponent);
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

test('a flight card for an unknown ID says so instead of crashing', () => {
  setup();
  const fixture = TestBed.createComponent(FlightCardComponent);

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
  const fixture = TestBed.createComponent(ArrivalsBoardComponent);

  fixture.componentRef.setInput('title', 'Arriving');
  fixture.componentRef.setInput('airport', 'SEA');
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

test('the arrivals board title has no dashes', () => {
  setup();
  const fixture = TestBed.createComponent(ArrivalsBoardComponent);

  fixture.componentRef.setInput('title', 'Arrivals at Seattle — nearest first');
  fixture.componentRef.setInput('airport', 'SEA');
  fixture.componentRef.setInput('hexes', []);
  fixture.detectChanges();

  const element = fixture.nativeElement as HTMLElement;
  expect(element.querySelector('.atc-card-title')?.textContent).toBe(
    'Arrivals at Seattle, nearest first',
  );
});

test('the compare takeaway has no dashes', () => {
  setup();
  const fixture = TestBed.createComponent(AircraftCompareComponent);

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
  const fixture = TestBed.createComponent(AircraftCompareComponent);

  fixture.componentRef.setInput('takeaway', 'Same jet.');
  fixture.componentRef.setInput('hexes', ['aaaaaa', 'ffffff']);
  fixture.detectChanges();

  const text = (fixture.nativeElement as HTMLElement).querySelector(
    '[data-testid="aircraft-compare"]',
  )?.textContent;
  expect(text).toContain('UAL100');
  expect(text).toContain('Unknown aircraft');
});
