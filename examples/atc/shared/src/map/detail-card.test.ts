// @vitest-environment jsdom
import { expect, test } from 'vitest';
import type { AircraftDetailView } from '../detail-view';
import {
  createDetailCard,
  detailCardPosition,
  isInsideArea,
  visibleMapArea,
} from './detail-card';

const view: AircraftDetailView = {
  hex: 'aaaaaa',
  label: 'N352LL',
  subtitle: null,
  hiddenRows: 0,
  groups: [
    {
      title: 'Identity',
      rows: [{ label: 'Registration', value: 'N352LL' }],
    },
    {
      title: 'Altitude',
      rows: [{ label: 'Pressure altitude', value: '4,500 ft' }],
    },
    {
      title: 'Speed and direction',
      rows: [
        { label: 'Ground speed', value: '110 kt' },
        { label: 'Wind', value: '262° at 18 kt' },
      ],
    },
  ],
};

/** Makes the card report 20 px per rendered row as its height. */
function measureByRows(element: HTMLElement) {
  Object.defineProperty(element, 'offsetHeight', {
    get: () => element.querySelectorAll('.atc-detail-row').length * 20,
  });
}

test('detailCardPosition puts the card right of the plane, else left, inside the map', () => {
  const card = { width: 200, height: 100 };
  const map = { width: 600, height: 400 };

  const positions = [
    detailCardPosition({ x: 100, y: 200 }, card, map),
    detailCardPosition({ x: 500, y: 200 }, card, map),
    detailCardPosition({ x: 100, y: 10 }, card, map),
    detailCardPosition({ x: 100, y: 395 }, card, map),
    detailCardPosition({ x: 100, y: 200 }, card, { width: 150, height: 80 }),
  ];

  expect(positions).toEqual([
    { x: 118, y: 150 },
    { x: 282, y: 150 },
    { x: 118, y: 8 },
    { x: 118, y: 292 },
    { x: 8, y: 8 },
  ]);
});

test('createDetailCard shows the view as text, never as markup', () => {
  const card = createDetailCard(document);
  const hostile: AircraftDetailView = {
    ...view,
    subtitle: '<img src=x onerror=alert(1)>',
  };

  card.show(hostile, 1000);

  expect(card.element.getAttribute('data-testid')).toBe('aircraft-detail');
  expect(card.element.classList.contains('is-open')).toBe(true);
  expect(card.element.querySelector('img')).toBeNull();
  expect(card.element.textContent).toContain('<img src=x onerror=alert(1)>');
  expect(card.element.textContent).toContain('Pressure altitude4,500 ft');
});

test('createDetailCard rebuilds only when the view changes', () => {
  const card = createDetailCard(document);
  card.show(view, 1000);
  const header = card.element.firstChild;

  card.show({ ...view }, 1000);
  const same = card.element.firstChild;
  card.show({ ...view, label: 'N352LM' }, 1000);

  expect(same).toBe(header);
  expect(card.element.firstChild).not.toBe(header);
  expect(card.element.textContent).toContain('N352LM');
});

test('createDetailCard hides and places itself with a transform', () => {
  const card = createDetailCard(document);
  card.show(view, 1000);

  card.place({ x: 100, y: 200 }, { width: 600, height: 400 });
  card.hide();

  expect(card.element.style.transform).toBe('translate(118px, 200px)');
  expect(card.element.classList.contains('is-open')).toBe(false);
  expect(card.element.getAttribute('aria-hidden')).toBe('true');
});

test('createDetailCard trims to fit and says how many readings it hid', () => {
  const card = createDetailCard(document);
  measureByRows(card.element);

  const fits = card.show(view, 60);

  expect(fits).toBe(true);
  expect(card.element.textContent).not.toContain('Wind');
  expect(card.element.textContent).toContain('1 reading hidden to fit');
});

test('createDetailCard hides rather than cut off when nothing fits', () => {
  const card = createDetailCard(document);
  measureByRows(card.element);
  card.show(view, 1000);

  const fits = card.show(view, 30);

  expect(fits).toBe(false);
  expect(card.element.classList.contains('is-open')).toBe(false);
});

test('visibleMapArea stops at a bottom sheet that covers the map', () => {
  const map = { left: 0, top: 0, right: 375, bottom: 812 };
  const peek = { left: 0, top: 604, right: 375, bottom: 812 };
  const beside = { left: 400, top: 0, right: 800, bottom: 812 };

  const areas = [
    visibleMapArea(map, null),
    visibleMapArea(map, peek),
    visibleMapArea(map, beside),
    visibleMapArea(map, { ...peek, top: -10 }),
  ];

  expect(areas).toEqual([
    { width: 375, height: 812 },
    { width: 375, height: 604 },
    { width: 375, height: 812 },
    { width: 375, height: 0 },
  ]);
});

test('isInsideArea is false for planes off the map or under the sheet', () => {
  const area = { width: 375, height: 604 };

  const inside = [
    isInsideArea({ x: 100, y: 100 }, area),
    isInsideArea({ x: -5, y: 100 }, area),
    isInsideArea({ x: 100, y: 700 }, area),
  ];

  expect(inside).toEqual([true, false, false]);
});

test('detailCardPosition goes above or below the plane when neither side fits', () => {
  const card = { width: 296, height: 200 };
  const phone = { width: 375, height: 600 };

  const positions = [
    detailCardPosition({ x: 200, y: 500 }, card, phone),
    detailCardPosition({ x: 200, y: 100 }, card, phone),
    detailCardPosition({ x: 200, y: 300 }, { ...card, height: 500 }, phone),
  ];

  expect(positions).toEqual([
    { x: 52, y: 282 },
    { x: 52, y: 118 },
    { x: 8, y: 50 },
  ]);
});
