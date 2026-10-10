// @vitest-environment jsdom
import { expect, test } from 'vitest';
import type { AircraftDetailView } from '../views';
import { createDetailCard, detailCardPosition } from './detail-card';

const view: AircraftDetailView = {
  hex: 'aaaaaa',
  label: 'N352LL',
  subtitle: null,
  groups: [
    {
      title: 'Identity',
      rows: [{ label: 'Registration', value: 'N352LL' }],
    },
    {
      title: 'Altitude',
      rows: [{ label: 'Pressure altitude', value: '4,500 ft' }],
    },
  ],
};

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

  card.show(hostile);

  expect(card.element.getAttribute('data-testid')).toBe('aircraft-detail');
  expect(card.element.classList.contains('is-open')).toBe(true);
  expect(card.element.querySelector('img')).toBeNull();
  expect(card.element.textContent).toContain('<img src=x onerror=alert(1)>');
  expect(card.element.textContent).toContain('Pressure altitude4,500 ft');
});

test('createDetailCard rebuilds only when the view changes', () => {
  const card = createDetailCard(document);
  card.show(view);
  const header = card.element.firstChild;

  card.show({ ...view });
  const same = card.element.firstChild;
  card.show({ ...view, label: 'N352LM' });

  expect(same).toBe(header);
  expect(card.element.firstChild).not.toBe(header);
  expect(card.element.textContent).toContain('N352LM');
});

test('createDetailCard hides and places itself with a transform', () => {
  const card = createDetailCard(document);
  card.show(view);

  card.place({ x: 100, y: 200 }, { width: 600, height: 400 });
  card.hide();

  expect(card.element.style.transform).toBe('translate(118px, 200px)');
  expect(card.element.classList.contains('is-open')).toBe(false);
  expect(card.element.getAttribute('aria-hidden')).toBe('true');
});
