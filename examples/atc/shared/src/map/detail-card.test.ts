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
  summary: {
    type: 'Cessna 172',
    route: null,
    figures: [
      { label: 'Altitude', value: '4,500 ft' },
      { label: 'Speed', value: '110 kt' },
    ],
  },
  groups: [
    {
      title: 'Identity',
      rows: [{ label: 'Registration', value: 'N352LL' }],
    },
    {
      title: 'Altitude',
      rows: [{ label: 'Vertical rate', value: '+500 fpm' }],
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
  expect(card.element.textContent).toContain('Vertical rate+500 fpm');
});

test('createDetailCard rebuilds its readings only when the view changes, and never its header', () => {
  const card = createDetailCard(document);
  card.show(view, 1000);
  const header = card.element.firstChild;
  const group = card.element.querySelector('.atc-detail-group');

  card.show({ ...view }, 1000);
  const same = card.element.querySelector('.atc-detail-group');
  card.show({ ...view, hiddenRows: 1 }, 1000);

  expect(same).toBe(group);
  expect(card.element.querySelector('.atc-detail-group')).not.toBe(group);
  expect(card.element.firstChild).toBe(header);
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

test('createDetailCard leads with the type line and the figures in the text face where they are words', () => {
  const card = createDetailCard(document);

  card.show(
    {
      ...view,
      summary: { ...view.summary, route: 'SFO → SEA · scheduled route' },
      groups: [
        {
          title: 'Identity',
          rows: [{ label: 'Kind', value: 'Single-engine prop', text: true }],
        },
      ],
    },
    1000,
  );

  const line = card.element.querySelector('.atc-detail-line')?.textContent;
  const figures = [...card.element.querySelectorAll('.atc-detail-figure')].map(
    (figure) => figure.textContent,
  );
  expect(line).toBe('Cessna 172 · SFO → SEA · scheduled route');
  expect(figures).toEqual(['Altitude4,500 ft', 'Speed110 kt']);
  expect(card.element.querySelector('dd.is-text')?.textContent).toBe(
    'Single-engine prop',
  );
});

test('a pinned card has a close button; a hovered one does not', () => {
  const closed: string[] = [];
  const card = createDetailCard(document, {
    onClose: () => closed.push('closed'),
  });

  card.show(view, 1000);
  const hovered =
    card.element.querySelector<HTMLElement>('.atc-detail-close')?.hidden;
  card.show(view, 1000, { pinned: true, docked: false });
  card.element.querySelector<HTMLElement>('.atc-detail-close')?.click();

  expect(hovered).toBe(true);
  expect(
    card.element.querySelector('.atc-detail-close')?.getAttribute('aria-label'),
  ).toBe('Close details for N352LL');
  expect(card.element.classList.contains('is-pinned')).toBe(true);
  expect(closed).toEqual(['closed']);
});

test('a docked card sits at the top, shows only the summary, and opens the rest with More', () => {
  const toggled: string[] = [];
  const card = createDetailCard(document, {
    onToggle: () => toggled.push('toggled'),
  });
  measureByRows(card.element);

  card.show(view, 30, { pinned: true, docked: true });
  card.place({ x: 300, y: 200 }, { width: 375, height: 500 });
  const compact = card.element.querySelectorAll('.atc-detail-row').length;
  const more = card.element.querySelector<HTMLElement>('.atc-detail-more');
  const before = more?.getAttribute('aria-expanded');
  more?.click();
  const fits = card.show(view, 30, { pinned: true, docked: true });

  expect(card.element.classList.contains('is-docked')).toBe(true);
  expect(card.element.style.transform).toBe('translate(8px, 8px)');
  expect(compact).toBe(0);
  expect(before).toBe('false');
  expect(toggled).toEqual(['toggled']);
  expect(fits).toBe(true);
  expect(card.element.querySelectorAll('.atc-detail-row')).toHaveLength(4);
  expect(
    card.element
      .querySelector('.atc-detail-more')
      ?.getAttribute('aria-expanded'),
  ).toBe('true');
  expect(card.element.style.maxHeight).toBe('30px');
});

/** `view` with a Position group whose message age reads `age`. */
function aged(age: string, altitude = '4,500 ft'): AircraftDetailView {
  return {
    ...view,
    summary: {
      ...view.summary,
      figures: [{ label: 'Altitude', value: altitude }],
    },
    groups: [
      ...view.groups,
      {
        title: 'Position',
        rows: [{ label: 'Last message', value: age }],
      },
    ],
  };
}

test('the close and More buttons survive every update, so focus and taps are kept', () => {
  const card = createDetailCard(document);
  document.body.append(card.element);
  const pinned = { pinned: true, docked: true };
  card.show(aged('3s ago'), 1000, pinned);
  const close = card.element.querySelector<HTMLElement>('.atc-detail-close');
  const more = card.element.querySelector<HTMLElement>('.atc-detail-more');
  close?.focus();

  card.show(aged('4s ago'), 1000, pinned);
  card.show(aged('5s ago', '4,600 ft'), 1000, pinned);
  more?.click();
  card.show(aged('6s ago', '4,700 ft'), 1000, pinned);

  expect(card.element.querySelector('.atc-detail-close')).toBe(close);
  expect(card.element.querySelector('.atc-detail-more')).toBe(more);
  expect(close?.isConnected).toBe(true);
  expect(document.activeElement).toBe(close);
  expect(card.element.textContent).toContain('Altitude4,700 ft');
  card.element.remove();
});

test('a new message age updates in place without rebuilding the readings', () => {
  const card = createDetailCard(document);
  card.show(aged('3s ago'), 1000);
  const group = card.element.querySelector('.atc-detail-group');

  card.show(aged('4s ago'), 1000);

  expect(card.element.querySelector('.atc-detail-group')).toBe(group);
  expect(card.element.textContent).toContain('Last message4s ago');
});
